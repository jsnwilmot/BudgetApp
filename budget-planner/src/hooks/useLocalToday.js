import { useEffect, useState } from 'react';
import { formatDateKey, getLocalToday } from '../logic/dateLogic';

export default function useLocalToday() {
  const [today, setToday] = useState(getLocalToday);

  useEffect(() => {
    let timer;

    function scheduleMidnight(now) {
      window.clearTimeout(timer);
      const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
      timer = window.setTimeout(refresh, nextMidnight - now);
    }

    function refresh() {
      const now = new Date();
      setToday(formatDateKey(now));
      scheduleMidnight(now);
    }

    function onVisibilityChange() {
      if (document.visibilityState === 'visible') refresh();
    }

    scheduleMidnight(new Date());
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, []);

  return today;
}
