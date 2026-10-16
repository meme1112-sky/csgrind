from celery import Celery
from celery.schedules import crontab

from app.config import settings

# Celery CLI: celery -A app.celery_app worker --loglevel=info
# Windows pool: celery -A app.celery_app worker --pool=solo --loglevel=info
# Beat: celery -A run_celery:app beat --loglevel=info
app = Celery(
    "csgrind_demos",
    broker=settings.redis_url,
    backend=settings.redis_url,
)

app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    # Redis priority queues: manual Valve uploads jump ahead of bulk FACEIT parses.
    broker_transport_options={
        "priority_steps": list(range(10)),
        "sep": ":",
        "queue_order_strategy": "priority",
    },
    task_default_priority=5,
    task_queue_max_priority=9,
    beat_schedule={
        # Daily 03:30 UTC — drop local demos older than DEMO_RETENTION_DAYS
        "cleanup-expired-demos-daily": {
            "task": "demos.cleanup_expired_demos",
            "schedule": crontab(hour=3, minute=30),
        },
    },
)

if settings.celery_eager:
    app.conf.task_always_eager = True
    app.conf.task_eager_propagates = True

# Do not import app.tasks here (circular import with main). Import tasks from run_celery.py for workers.
