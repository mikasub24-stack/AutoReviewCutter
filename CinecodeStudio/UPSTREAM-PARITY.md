# Restore the original Cinecode workflow

This is an integration work list, not a statement that the current desktop release has full parity.

The earlier 0.1.x desktop app replaced the original code-writing workflow with declarative text scenes and a fixed Canvas background. That change did not meet the request to make the original tool easier to use. Existing projects will remain readable, but the fixed template must not be presented as the original Cinecode engine.

The entire tracked upstream repository is restored unchanged under `vendor/cinecode`, pinned to `67f9807112b97ae253d4a5f0eccaccc46c3b2633`. `vendor/CINECODE-UPSTREAM.json` records every file hash; tests check completeness and initialize both original project types.

| Upstream feature | Desktop integration needed |
| --- | --- |
| Quick: original film.html, new scene code per film | Connect a coding agent and render the generated original project; no fixed scene replacement |
| Film: roadmap, script, style frame, animatic, draft, final | Native project stage view, review and resume |
| Three.js, camera vocabulary, lighting, looks, characters | Keep original starters/helpers and generated scene code |
| Sound design, narration, layers, mix, mastering | Run original sound tools and retain cue/voice timing |
| Music video, beat grid, lyrics | Keep original route and tools |
| Reference video and footage editing | Keep original tools and show optional prerequisites |
| Assets, fonts, styles and licence credits | Preserve source records and original credit generation |
| QC and targeted revisions | Original make.py/qc.py pipeline and project history |
| Long films | Original Film-mode projects and per-shot rendering |
| Easy Windows installation | Ship the complete runtime prerequisites; test the installed app |

Shipping source files alone does not complete any row above. A parity release needs an actual connected agent, a rendered original project and verification of the tools exposed in the interface. External AI availability still requires a user credential; a mocked API response is not proof of film quality.
