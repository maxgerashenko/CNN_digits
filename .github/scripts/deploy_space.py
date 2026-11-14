"""Copy the server/ folder to the Hugging Face Space.

Used by .github/workflows/deploy-space.yml.

  python deploy_space.py --check   decide if a deploy can run (never uploads)
  python deploy_space.py           upload server/ to the Space

Reads two environment variables:
  HF_TOKEN  Hugging Face access token with write access (repo secret)
  HF_SPACE  Space name like "username/space-name" (repo variable)

If the token, the Space name or a needed server file is missing, the check
prints a notice and reports "not ready". That is not an error, so pushes stay
green while the Space is not created yet.
"""

import os
import re
import sys
from pathlib import Path

SERVER_DIR = Path("server")

# The Space cannot start without these, so nothing is deployed until all exist.
REQUIRED_FILES = ["README.md", "Dockerfile", "requirements.txt", "app.py"]

# Local files that must never be copied to the Space.
IGNORE = ["*__pycache__*", "*.pyc", "*.pytest_cache*", ".venv/*", ".env"]


def notice(text):
    print(f"::notice title=Space deploy skipped::{text}")


def error(text):
    print(f"::error title=Space deploy::{text}")


def check():
    """Return True if a deploy can run. Print why not otherwise."""
    token = os.environ.get("HF_TOKEN", "").strip()
    space = os.environ.get("HF_SPACE", "").strip()

    missing = []
    if not token:
        missing.append("the secret HF_TOKEN")
    if not space:
        missing.append("the variable HF_SPACE")
    if missing:
        notice(
            "Not set up yet: add "
            + " and ".join(missing)
            + " in the repo settings (Secrets and variables > Actions)."
        )
        return False

    if not re.fullmatch(r"[\w.-]+/[\w.-]+", space):
        # A wrong name is a real mistake, so this one fails the run.
        error("HF_SPACE must look like username/space-name (no https://, no spaces).")
        sys.exit(1)

    absent = [name for name in REQUIRED_FILES if not (SERVER_DIR / name).is_file()]
    if absent:
        notice(
            "The server is not complete yet. Missing in server/: " + ", ".join(absent)
        )
        return False

    return True


def deploy():
    from huggingface_hub import HfApi

    space = os.environ["HF_SPACE"].strip()
    commit = os.environ.get("GITHUB_SHA", "")[:7] or "local"

    info = HfApi(token=os.environ["HF_TOKEN"].strip()).upload_folder(
        repo_id=space,
        repo_type="space",
        folder_path=SERVER_DIR,
        ignore_patterns=IGNORE,
        # Make the Space an exact copy: remove files deleted from server/.
        delete_patterns="*",
        commit_message=f"Deploy from GitHub ({commit})",
    )
    print(f"Deployed server/ to https://huggingface.co/spaces/{space}")
    print(f"Space commit: {info.oid}")


def main():
    ready = check()
    if "--check" in sys.argv:
        output = os.environ.get("GITHUB_OUTPUT")
        if output:
            with open(output, "a") as f:
                f.write(f"ready={'true' if ready else 'false'}\n")
        print("Ready to deploy." if ready else "Nothing deployed.")
        return
    if ready:
        deploy()


if __name__ == "__main__":
    main()
