import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import diagnostics


class DiagnosticsTests(unittest.TestCase):
    def test_probe_is_bounded_hidden_no_shell_and_throttled(self):
        result = subprocess.CompletedProcess([], 0, 'NVIDIA GeForce RTX 3060, 12288, 11000, 91\n', '')
        with patch.object(diagnostics.shutil, 'which', return_value='/bin/nvidia-smi'), patch.object(diagnostics.subprocess, 'run', return_value=result) as run:
            probe = diagnostics.GPUProbe()
            first = probe.snapshot(); second = probe.snapshot()
            self.assertEqual(first, second); self.assertEqual(run.call_count, 1)
            self.assertEqual(first['status'], 'available')
            self.assertEqual(first['devices'][0]['gpu_utilization_percent'], 91)
            self.assertLessEqual(run.call_args.kwargs['timeout'], 3)
            self.assertFalse(run.call_args.kwargs['shell'])
            self.assertIn('creationflags', run.call_args.kwargs)
            self.assertIn('memory.total', run.call_args.args[0][1])
            self.assertIn('10.7/12.0 GB VRAM', diagnostics.describe(first))
            second['devices'].clear()
            self.assertTrue(probe.snapshot()['devices'])

    def test_missing_or_timed_out_telemetry_is_unknown_not_failure(self):
        with patch.object(diagnostics.shutil, 'which', return_value=None), patch.object(diagnostics.Path, 'is_file', return_value=False):
            self.assertEqual(diagnostics.GPUProbe().snapshot()['status'], 'unknown')
        with patch.object(diagnostics.shutil, 'which', return_value='nvidia-smi'), patch.object(diagnostics.subprocess, 'run', side_effect=subprocess.TimeoutExpired('nvidia-smi', 3)):
            value = diagnostics.GPUProbe().snapshot()
            self.assertEqual(value['status'], 'unknown')
            self.assertIn('chưa thể kết luận', diagnostics.describe(value))

    def test_log_tail_is_bounded_redacted_and_marked_unverified(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            secret = 'super-secret-value'
            lines = ['old line'] * 10000 + ['\x1b[32mline '+str(i)+'\x1b[0m' for i in range(25)]
            lines += ['Authorization: Bearer '+secret, 'token='+secret, 'step 2/12']
            (root/'comfyui.log').write_text('\n'.join(lines))
            with patch.object(diagnostics, 'gpu_snapshot', return_value={'status':'unknown','devices':[]}):
                path = diagnostics.export(root, version='0.3.2')
            report = json.loads(path.read_text())
            self.assertEqual(len(report['backend_log']['lines']), 20)
            self.assertFalse(report['backend_log']['current_session_verified'])
            self.assertIn('modified_at_utc', report['backend_log'])
            self.assertNotIn(secret, path.read_text()); self.assertNotIn('\x1b', '\n'.join(report['backend_log']['lines']))
            self.assertNotIn('environment', report); self.assertNotIn('config', report)
            self.assertEqual(report['app_version'], '0.3.2')

    def test_unreadable_external_log_is_not_mislabeled_as_current(self):
        with tempfile.TemporaryDirectory() as td:
            value = diagnostics.read_backend_log(td)
            self.assertFalse(value['available']); self.assertFalse(value['current_session_verified'])
            self.assertEqual(value['lines'], [])


if __name__ == '__main__': unittest.main()
