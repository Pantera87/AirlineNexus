import { useGameStore } from '@store/gameStore';
import { Inbox, CheckCheck } from 'lucide-react';
import { formatDate, formatRelativeTime } from '@utils/helpers';

export function NotificationsScreen() {
  const notifications = useGameStore((state) => state.notifications);
  const markNotificationRead = useGameStore((state) => state.markNotificationRead);
  const markAllNotificationsRead = useGameStore((state) => state.markAllNotificationsRead);

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  return (
    <div className="h-full overflow-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-white">Messages</h1>
          <p className="text-sm text-runway-400">
            {notifications.length === 0
              ? 'No messages yet.'
              : `${unreadCount} unread of ${notifications.length} total`}
          </p>
        </div>
        {unreadCount > 0 && (
          <button
            onClick={markAllNotificationsRead}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-sky-500/10 text-sky-400 hover:bg-sky-500/20 transition-colors text-sm font-medium"
          >
            <CheckCheck className="w-4 h-4" />
            Mark all as read
          </button>
        )}
      </div>

      {/* Message list */}
      {notifications.length === 0 ? (
        <div className="glass-panel p-6 flex flex-col items-center justify-center py-16 text-center">
          <Inbox className="w-10 h-10 text-runway-500 mb-3" />
          <p className="text-sm text-runway-400">
            No messages yet. In-game events will show up here.
          </p>
        </div>
      ) : (
        <div className="glass-panel divide-y divide-white/5 overflow-hidden">
          {notifications.map((notif) => (
            <button
              key={notif.id}
              onClick={() => !notif.isRead && markNotificationRead(notif.id)}
              className={`w-full text-left px-4 py-3 transition-colors ${
                !notif.isRead ? 'hover:bg-white/5' : 'opacity-60'
              }`}
              title={notif.isRead ? undefined : 'Mark as read'}
            >
              <div className="flex items-start gap-3">
                {/* Red dot for unread */}
                {!notif.isRead && (
                  <span className="mt-1.5 w-2 h-2 rounded-full bg-red-500 shrink-0" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <p
                      className={`text-sm font-medium ${
                        !notif.isRead ? 'text-white' : 'text-runway-300'
                      }`}
                    >
                      {notif.title}
                    </p>
                    <span
                      className={`badge shrink-0 ${
                        notif.type === 'success'
                          ? 'badge-success'
                          : notif.type === 'warning'
                            ? 'badge-warning'
                            : notif.type === 'error'
                              ? 'badge-danger'
                              : 'badge-info'
                      }`}
                    >
                      {notif.type}
                    </span>
                  </div>
                  <p className="text-xs text-runway-400">{notif.message}</p>
                  <p className="text-[10px] text-runway-500 mt-1">
                    {formatDate(notif.timestamp)} • {formatRelativeTime(notif.timestamp)}
                  </p>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
