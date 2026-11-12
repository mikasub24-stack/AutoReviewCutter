"""Recover app-owned projects from a local Comfy queue without browsing folders.

Only known roots' immediate children and a remembered project are inspected.
No queue item is changed here; deletion remains an explicit UI action.
"""
from __future__ import annotations
import itertools
import json
from pathlib import Path
import re
import urllib.parse

MAX_MANIFEST_BYTES = 8 * 1024 * 1024
MAX_CHILDREN_PER_ROOT = 2000
TOPICS = ('Dọn nhà bỏ hoang', 'Sinh tồn trong rừng')
_ID = re.compile(r'[0-9a-f]{32}\Z')
_SHA = re.compile(r'[0-9a-fA-F]{64}\Z')


def _link(path):
    return path.is_symlink() or (hasattr(path, 'is_junction') and path.is_junction())


def _server(url):
    try:
        parsed = urllib.parse.urlsplit(str(url).strip())
        if (parsed.scheme != 'http' or parsed.hostname not in ('localhost', '127.0.0.1', '::1')
                or parsed.username or parsed.password or parsed.query or parsed.fragment
                or parsed.path not in ('', '/')):
            return None
        # localhost and IPv4 loopback refer to the managed server's normal host.
        host = '127.0.0.1' if parsed.hostname == 'localhost' else parsed.hostname
        return host, parsed.port or 80
    except (ValueError, TypeError):
        return None


def read_project(path):
    """Return a bounded, validated app manifest or None; never follow a link."""
    path = Path(path)
    manifest = path / 'project.json'
    try:
        if _link(path) or _link(manifest) or not path.is_dir():
            return None
        if not manifest.is_file() or manifest.stat().st_size > MAX_MANIFEST_BYTES:
            return None
        with manifest.open('rb') as source:
            raw = source.read(MAX_MANIFEST_BYTES + 1)
        if len(raw) > MAX_MANIFEST_BYTES:
            return None
        data = json.loads(raw)
        if (not isinstance(data, dict) or not isinstance(data.get('id'), str)
                or not _ID.fullmatch(data['id']) or data.get('topic') not in TOPICS
                or not isinstance(data.get('scenes'), list)
                or any(not isinstance(scene, dict) for scene in data['scenes'])
                or not isinstance(data.get('portrait_request', {}), dict)):
            return None
        if data.get('server') and not _server(data['server']):
            return None
        return data
    except (OSError, ValueError, TypeError):
        return None


def _unfinished(path, data):
    sha = data.get('final_sha256')
    return not (isinstance(sha, str) and _SHA.fullmatch(sha)
                and (path / 'video-hoan-tat.mp4').is_file())


def _requests(data):
    requests = data['scenes'] + [data.get('portrait_request', {})]
    ids = {item['prompt_id'] for item in requests if isinstance(item.get('prompt_id'), str)}
    markers = {item['request_marker'] for item in requests if isinstance(item.get('request_marker'), str)}
    return ids, markers


def _matches(task, data, ids, markers):
    if not isinstance(task, (tuple, list)) or len(task) < 4 or not isinstance(task[1], str) or not task[1]:
        return False
    prompt, extra = task[2], task[3]
    if not isinstance(prompt, dict) or not isinstance(extra, dict):
        return False
    if task[1] in ids or extra.get('client_id') == data['id']:
        return True
    if any(isinstance(extra.get(key),str) and extra[key] in markers
           for key in ('hunyuanlocal_request', 'wanlocal_request')):
        return True
    for node in prompt.values():
        if not isinstance(node, dict) or node.get('class_type') != 'SaveImage':
            continue
        inputs = node.get('inputs')
        prefix = inputs.get('filename_prefix') if isinstance(inputs, dict) else None
        if isinstance(prefix, str) and any(prefix.startswith(f'{kind}/{data["id"]}/')
                                          for kind in ('HunyuanLocal', 'WanLocal')):
            return True
    return False


def discover(roots, active_path=None, queues=()):
    """Return matched projects as dicts, never guess a newest folder.

    Each result has path (Path), id, topic, server, prompt_ids, running, pending,
    matched_queue. If no queue project matches, the remembered active_path is
    returned only when unfinished, alongside other queue matches so an explicitly
    selected paused project cannot silently switch to another project. Finished
    folders are otherwise never selected.
    Caller may show an inline choice if more than one project matches.
    """
    paths = {}
    remembered = None
    if active_path:
        path = Path(active_path)
        data = read_project(path)
        if data is not None:
            remembered = path.resolve()
            paths[remembered] = (path, data)
    for root in roots:
        try:
            root = Path(root)
            if _link(root) or not root.is_dir():
                continue
            for child in itertools.islice(root.iterdir(), MAX_CHILDREN_PER_ROOT):
                if _link(child) or not child.is_dir():
                    continue
                resolved = child.resolve()
                if resolved in paths:
                    continue
                data = read_project(child)
                if data is not None:
                    paths[resolved] = (child, data)
        except (OSError, ValueError, TypeError):
            continue
    queue_records = []
    for url, queue in queues:
        server = _server(url)
        if server is None or not isinstance(queue, dict):
            continue
        for name, running in (('queue_running', True), ('queue_pending', False)):
            tasks = queue.get(name, [])
            if isinstance(tasks, list):
                queue_records.extend((str(url).rstrip('/'), server, task, running) for task in tasks)
    matches = []
    fallback = None
    for resolved, (path, data) in paths.items():
        ids, markers = _requests(data)
        saved_server = _server(data['server']) if data.get('server') else None
        result = {'path': path, 'id': data['id'], 'topic': data['topic'],
                  'server': data.get('server', ''), 'prompt_ids': [],
                  'running': False, 'pending': False, 'matched_queue': False}
        matched_ids = set()
        for url, server, task, running in queue_records:
            if saved_server is not None and saved_server != server:
                continue
            if _matches(task, data, ids, markers):
                result['server'] = url
                result['running'] |= running
                result['pending'] |= not running
                result['matched_queue'] = True
                matched_ids.add(task[1])
        if matched_ids:
            result['prompt_ids'] = sorted(matched_ids)
            matches.append(result)
        elif resolved == remembered and _unfinished(path, data):
            fallback = result
    if matches:
        if fallback:matches.append(fallback)
        return sorted(matches, key=lambda item: (not item['running'], str(item['path'])))
    return [fallback] if fallback else []
