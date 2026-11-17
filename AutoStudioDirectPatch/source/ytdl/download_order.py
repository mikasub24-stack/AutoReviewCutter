"""Preserve scanned episode names/order when URLs already exist in the download tab.

No filesystem renaming, no downloader-core replacement, no active-worker mutation.
"""
from contextlib import nullcontext

IDLE = {'Chờ', 'Tạm dừng', 'Lỗi'}


def reconcile(download_tab, lines):
    engine = getattr(download_tab, 'eng', None)
    if engine is None:
        return 0
    requested = {}
    for line in lines:
        parts = line.split('\t')
        if len(parts) >= 2 and parts[0] not in requested:
            requested[parts[0]] = (parts[1], parts[2] if len(parts) > 2 else '')
    changed = []
    with getattr(engine, 'lock', nullcontext()):
        by_url = {engine.items[i]['url']: i for i in engine.order if i in engine.items}
        ordered_ids = [by_url[u] for u in requested if u in by_url]
        selected = set(ordered_ids)
        slots = [index for index, iid in enumerate(engine.order) if iid in selected]
        for index, iid in zip(slots, ordered_ids):
            engine.order[index] = iid
        for url, (name, direct) in requested.items():
            iid = by_url.get(url)
            if iid is None:
                continue
            item = engine.items[iid]
            if item.get('status') not in IDLE:
                continue
            item.update(title=name, edited=True, fetching=False)
            if direct:
                item['direct'] = direct
            changed.append(iid)
    # Tk calls stay on the caller/UI thread and outside the engine lock.
    for iid in changed:
        download_tab.refresh(iid)
    rebuild = getattr(download_tab, 'rebuild_tree', None)
    if rebuild:
        rebuild()
    return len(changed)
