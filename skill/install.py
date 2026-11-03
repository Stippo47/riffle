#!/usr/bin/env python3
"""Copies the skill to where Claude Code finds it, with the format notes beside it. Run it after changing the skill."""
import pathlib
import shutil

here = pathlib.Path(__file__).resolve().parent
target = pathlib.Path.home() / '.claude' / 'skills' / 'riffle'
target.mkdir(parents=True, exist_ok=True)
for name in ('SKILL.md', 'riffle.py', 'notify.mjs'):
    shutil.copyfile(here / name, target / name)
shutil.copyfile(here.parent / 'docs' / 'format.md', target / 'format.md')
print(f'Installed to {target}')
