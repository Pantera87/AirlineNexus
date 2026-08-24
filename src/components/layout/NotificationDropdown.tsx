import { useEffect, useRef, useState } from 'react';
import { useGameStore } from '@store/gameStore';
import { Bell, Inbox, ArrowRight } from 'lucide-react';
import { formatRelativeTime } from '@utils/helpers';

export function NotificationDropdown() {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const notifications = useGameStore((state) => state.notifications);
  const markNotificationRead = useGameStore((state) => state.markNotificationRead);
  const navigateTo = useGameStore((state) => state.navigateTo);

  // The dropdown only shows unread notifications — reading one makes it disappear.
  const unreadNotifications = notifications.filter((n) => !n.isRead);

  // Close the dropdown on outside click or Escape key
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsOpen(false);
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen]);

  const viewAllMessages = () => {
    setIsOpen(false);
    navigateTo('notifications');
  };

  return (
    <div className="relative" ref={containerRef}>
      {/* Bell button */}
      <button
        onClick={() => setIsOpen((open) => !open)}
        className={`relative p-2 transition-colors ${
          isOpen ? 'text-sky-400 bg-sky-500/10 rounded-lg' : 'text-runway-400 hover:text-white'
        }`}
        title="Notifications"
      >
        <Bell className="w-5 h-5" />
        {unreadNotifications.length > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 rounded-full text-[10px] flex items-center justify-center text-white font-bold">
            {unreadNotifications.length}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute top-full right-0 mt-2 w-96 max-w-[calc(100vw-3rem)] rounded-xl overflow-hidden z-50 bg-cockpit-panel border border-white/10 shadow-2xl shadow-black/50">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
            <h3 className="text-sm font-semibold text-white">Notifications</h3>
            {unreadNotifications.length > 0 && (
              <span className="text-xs text-runway-400">{unreadNotifications.length} unread</span>
            )}
          </div>

          {/* Unread list */}
          <div className="max-h-80 overflow-y-auto">
            {unreadNotifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center px-4">
                <Inbox className="w-8 h-8 text-runway-500 mb-2" />
                <p className="text-sm text-runway-400">You're all caught up.</p>
              </div>
            ) : (
              unreadNotifications.map((notif) => (
                <button
                  key={notif.id}
                  onClick={() => markNotificationRead(notif.id)}
                  className="w-full text-left px-4 py-3 border-b border-white/5 last:border-b-0 hover:bg-white/5 transition-colors"
                  title="Mark as read"
                >
                  <div className="flex items-start gap-2.5">
                    {/* Red dot for unread */}
                    <span className="mt-1.5 w-2 h-2 rounded-full bg-red-500 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2 mb-0.5">
                        <p className="text-sm font-medium text-white truncate">{notif.title}</p>
                        <span className="text-[10px] text-runway-400 shrink-0">
                          {formatRelativeTime(notif.timestamp)}
                        </span>
                      </div>
                      <p className="text-xs text-runway-300 line-clamp-2">{notif.message}</p>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>

          {/* Footer */}
          <div className="border-t border-white/5 p-2">
            <button
              onClick={viewAllMessages}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-sky-400 hover:bg-sky-500/10 transition-colors"
            >
              View All Messages
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
