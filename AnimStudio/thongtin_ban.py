# -*- coding: utf-8 -*-
"""In ra so phien ban (doc truc tiep animstudio/__init__.py, khong import goi) - build.bat / tao_setup.bat dung de dat ten Setup."""
import os, re
p = os.path.join(os.path.dirname(os.path.abspath(__file__)), "animstudio", "__init__.py")
print(re.search(r"__version__\s*=\s*['\"]([^'\"]+)['\"]", open(p, encoding="utf-8").read()).group(1))
