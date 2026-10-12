import asyncio
import json
from typing import Set

class MonitoringBroadcaster:
    def __init__(self):
        self._subscribers: Set[asyncio.Queue] = set()

    def subscribe(self) -> asyncio.Queue:
        queue = asyncio.Queue()
        self._subscribers.add(queue)
        return queue

    def unsubscribe(self, queue: asyncio.Queue):
        self._subscribers.discard(queue)

    async def broadcast(self, event_type: str, data: dict):
        if not self._subscribers:
            return
        message = json.dumps({"event": event_type, "data": data})
        # Dispatch to all active subscriber queues
        dead = set()
        for q in self._subscribers:
            try:
                q.put_nowait(message)
            except Exception:
                dead.add(q)
        for d in dead:
            self._subscribers.discard(d)

broadcaster = MonitoringBroadcaster()
