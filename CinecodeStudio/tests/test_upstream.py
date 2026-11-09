"""Preserve upstream functionality instead of substituting a fixed scene template."""
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

ROOT=Path(__file__).resolve().parents[1]
KIT=ROOT/'vendor/cinecode'

class UpstreamTests(unittest.TestCase):
    def test_every_tracked_upstream_file_is_present_and_unchanged(self):
        manifest=json.loads((ROOT/'vendor/CINECODE-UPSTREAM.json').read_text(encoding='utf-8'))
        self.assertEqual(manifest['commit'],'67f9807112b97ae253d4a5f0eccaccc46c3b2633')
        for name,digest in manifest['files'].items():
            path=KIT/name
            self.assertTrue(path.is_file(),name)
            self.assertEqual(hashlib.sha256(path.read_bytes()).hexdigest(),digest,name)

    def test_original_quick_and_film_projects_initialize(self):
        for quick in (True,False):
            with tempfile.TemporaryDirectory() as td:
                project=Path(td)/'film'
                args=[sys.executable,str(KIT/'scripts/init_film.py'),str(project),'--title','Cinecode project']
                if quick:args.append('--quick')
                run=subprocess.run(args,capture_output=True,text=True,encoding='utf-8',errors='replace')
                self.assertEqual(run.returncode,0,run.stderr+run.stdout)
                self.assertTrue((project/'STATE.md').is_file())
                for tool in ('make.py','capture.mjs','mix.py','master_audio.py','qc.py','tts.py'):
                    self.assertTrue((project/'tools'/tool).is_file(),tool)
                self.assertTrue((project/'film.html' if quick else project/'engine/scene.html').is_file())
                if not quick:
                    for asset in ('looks.mjs','camera.mjs','type.mjs'):
                        self.assertTrue((project/'engine'/asset).is_file())

if __name__=='__main__':unittest.main()
