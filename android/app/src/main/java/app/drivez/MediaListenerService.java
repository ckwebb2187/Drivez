package app.drivez;

import android.service.notification.NotificationListenerService;

// Does nothing by itself. Android only lets an app read the phone's media
// sessions (what's playing, play/pause/skip) while it has "notification access",
// and that access is granted to a listener service like this one.
public class MediaListenerService extends NotificationListenerService {
}
