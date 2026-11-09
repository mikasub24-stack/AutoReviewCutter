import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import upstream


class AgentDetectionTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory()
        self.root=Path(self.temp.name)
        self.env=patch.dict(os.environ,{'LOCALAPPDATA':str(self.root/'local'),'APPDATA':str(self.root/'roaming')})
        self.env.start()
        self.home=patch.object(Path,'home',return_value=self.root/'user');self.home.start()
        self.which=patch.object(upstream.shutil,'which',return_value=None);self.which.start()
        upstream._agent_version_cache.clear()

    def tearDown(self):
        self.which.stop();self.home.stop();self.env.stop();self.temp.cleanup()
        upstream._agent_version_cache.clear()

    def file(self,name):
        path=self.root/name;path.parent.mkdir(parents=True,exist_ok=True);path.touch();return path

    def test_off_path_npm_resolves_script_without_executing_shell_shim(self):
        self.file('roaming/npm/claude.cmd')
        cli=self.file('roaming/npm/node_modules/@anthropic-ai/claude-code/cli.js')
        with patch.object(upstream.core,'executable',return_value='node.exe'),patch.object(upstream,'claude_version',return_value='2.0 (Claude Code)'):
            self.assertEqual(upstream.agent_command(),['node.exe',str(cli)])

    def test_cursor_extension_native_cli_found_without_path(self):
        cli=self.file('user/.cursor/extensions/anthropic.claude-code-2.0/resources/native-binary/claude.exe')
        with patch.object(upstream,'claude_version',return_value='2.0 (Claude Code)'):
            self.assertEqual(upstream.agent_command(),[str(cli)])

    def test_manual_custom_path_survives_fresh_detection(self):
        cli=self.file('custom location/claude.exe')
        response=subprocess.CompletedProcess([],0,'2.0.0 (Claude Code)\n','')
        with patch.object(upstream.subprocess,'run',return_value=response) as probe:
            upstream.choose_claude(cli)
            upstream._agent_version_cache.clear()
            self.assertEqual(upstream.agent_command(),[str(cli)])
            self.assertEqual(probe.call_args.args[0],[str(cli),'--version'])
            self.assertNotIn('shell',probe.call_args.kwargs)
        data=json.loads(upstream.agent_settings_path().read_text())
        self.assertEqual(data['claudeCode'],str(cli));self.assertEqual(data['preferredAgent'],'Claude Code')

    def test_failed_probe_does_not_replace_saved_path(self):
        cli=self.file('custom/claude.exe')
        upstream._save_agent_path('claudeCode',cli,'Claude Code')
        other=self.file('other/claude.exe')
        with patch.object(upstream.subprocess,'run',return_value=subprocess.CompletedProcess([],1,'','not CLI')):
            with self.assertRaises(ValueError):upstream.choose_claude(other)
        self.assertEqual(upstream.saved_claude_path(),str(cli))

    def test_desktop_is_separate_and_never_given_cli_arguments(self):
        desktop=self.file('local/AnthropicClaude/claude.exe')
        with patch.object(upstream.subprocess,'run') as probe:
            self.assertIsNone(upstream._claude_prefix(desktop))
            upstream.choose_desktop(desktop)
            self.assertEqual(upstream.desktop_command(),[str(desktop)])
            probe.assert_not_called()
        with patch.object(upstream.subprocess,'Popen') as spawn:
            upstream.launch_agent(self.root,upstream.CLAUDE_DESKTOP,login=True)
            self.assertEqual(spawn.call_args.args[0],[str(desktop)])
        self.assertEqual(upstream.saved_agent_settings()['preferredAgent'],upstream.CLAUDE_DESKTOP)
        self.assertEqual(upstream.saved_claude_path(),'')

    def test_installers_not_saved_as_agents(self):
        installer=self.file('ClaudeSetup.exe')
        with self.assertRaises(ValueError):upstream.choose_claude(installer)
        with self.assertRaises(ValueError):upstream.choose_desktop(installer)
        self.assertFalse(upstream.agent_settings_path().exists())


if __name__=='__main__':unittest.main()
