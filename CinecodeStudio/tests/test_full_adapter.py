import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import upstream

class FullAdapterTests(unittest.TestCase):
    def test_project_preserves_original_toolkit_and_registers_native_skill(self):
        with tempfile.TemporaryDirectory() as td:
            project=upstream.create_project(td,'A film about rain','Film','Phim / hoạt hình','10 phút','English','Claude Code','Tự làm đến MP4','Không nhạc / hiệu ứng âm thanh')
            self.assertTrue((project/'engine/scene.html').is_file())
            self.assertTrue((project/'.claude/skills/cinecode/SKILL.md').is_file())
            self.assertTrue((project/'.claude/skills/cinecode/references/characters.md').is_file())
            self.assertTrue((project/'tools/scene_check.py').is_file())
            brief=(project/'.cinecode-ui/START-HERE.md').read_text(encoding='utf-8')
            self.assertIn('English',brief);self.assertIn('10 phút',brief)
            command=upstream.tool_command(project,'make.py',['draft'])
            self.assertEqual(command[-1],'draft')
            helper=project/'tools/fonts.py';original=helper.read_bytes();helper.write_text('modified helper',encoding='utf-8')
            with self.assertRaises(ValueError):upstream.tool_command(project,'make.py',['draft'])
            helper.write_bytes(original)
            (project/'tools/make.py').write_text('modified',encoding='utf-8')
            with self.assertRaises(ValueError):upstream.tool_command(project,'make.py',['final'])

    def test_native_agent_launch_is_literal_and_does_not_enable_permission_bypass(self):
        with tempfile.TemporaryDirectory(prefix='film & project ') as td,patch.object(upstream,'agent_command',return_value=['claude.exe']),patch.object(upstream.subprocess,'Popen') as spawn,patch.dict(os.environ,{'ANTHROPIC_API_KEY':'not-for-subscription','ANTHROPIC_AUTH_TOKEN':'not-for-subscription'}):
            upstream.launch_agent(td)
            command=spawn.call_args.args[0];kw=spawn.call_args.kwargs
            self.assertEqual(command[0],'claude.exe');self.assertTrue(command[1].startswith('/cinecode'))
            self.assertNotIn('--dangerously-skip-permissions',command)
            self.assertNotIn('shell',kw);self.assertEqual(kw['cwd'],Path(td).resolve())
            self.assertNotIn('ANTHROPIC_API_KEY',kw['env']);self.assertNotIn('ANTHROPIC_AUTH_TOKEN',kw['env'])

if __name__=='__main__':unittest.main()
