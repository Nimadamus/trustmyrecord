from apscheduler.schedulers.blocking import BlockingScheduler
from tasks import grade_pending_picks

sched = BlockingScheduler()

@sched.scheduled_job('interval', hours=1)
def timed_job():
    print('Running grade_pending_picks job.')
    grade_pending_picks()

sched.start()
