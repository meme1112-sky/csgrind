"""
Celery worker entry: registers tasks then exposes the Celery app.

Run from extra-backend/:
  celery -A run_celery:app worker --loglevel=info
  celery -A run_celery:app worker --pool=solo --loglevel=info   # Windows
"""

import app.tasks  # noqa: F401  (import first so the package name isn't shadowed below)
from app.celery_app import app  # noqa: E402  (must come last: binds `app` to the Celery instance)
