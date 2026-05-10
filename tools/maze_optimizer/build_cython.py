"""Build script for Cython pathfinding module. Run: python build_cython.py"""
import os
import subprocess
import sys

def build():
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    # Filter out compiler flags the local gcc may not support
    env = os.environ.copy()
    env["CFLAGS"] = env.get("CFLAGS", "") + " -Wno-error"
    subprocess.check_call([
        sys.executable, "-c",
        "import sysconfig, os;"
        "cflags = sysconfig.get_config_var('CFLAGS') or '';"
        "clean = ' '.join(f for f in cflags.split() if not f.startswith('-fdebug-default-version'));"
        "os.environ['CFLAGS'] = clean;"
        "from Cython.Build import cythonize;"
        "from setuptools import setup, Extension;"
        "import numpy;"
        "setup("
        "  ext_modules=cythonize("
        "    [Extension('pathfinding_cy', ['pathfinding_cy.pyx'],"
        "      include_dirs=[numpy.get_include()])],"
        "    compiler_directives={'boundscheck': False, 'wraparound': False},"
        "  ),"
        "  script_args=['build_ext', '--inplace'],"
        ")"
    ], env=env)

if __name__ == "__main__":
    build()
