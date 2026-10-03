package com.envelo.calls

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.uimanager.ViewManager

/** Keeps an explicitly accepted/started call audible while the app is backgrounded. */
class EnveloCallService : Service() {
  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val manager = getSystemService(NotificationManager::class.java)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      manager.createNotificationChannel(NotificationChannel("active-call", "Ongoing calls", NotificationManager.IMPORTANCE_LOW))
    }
    val launch = packageManager.getLaunchIntentForPackage(packageName)
    val pending = launch?.let { PendingIntent.getActivity(this, 0, it, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE) }
    val icon = resources.getIdentifier("notification_icon", "drawable", packageName)
    val notification = NotificationCompat.Builder(this, "active-call")
      .setSmallIcon(if (icon != 0) icon else applicationInfo.icon)
      .setContentTitle("Envelo call")
      .setContentText("Tap to return to your call")
      .setContentIntent(pending)
      .setCategory(NotificationCompat.CATEGORY_CALL)
      .setOngoing(true)
      .setSilent(true)
      .build()
    ServiceCompat.startForeground(this, 3101, notification,
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE else 0)
    return START_NOT_STICKY
  }

  override fun onTaskRemoved(rootIntent: Intent?) { stopSelf() }
}

class EnveloCallModule(private val context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
  override fun getName() = "EnveloCallService"
  @ReactMethod fun start(promise: Promise) {
    try {
      val intent = Intent(context, EnveloCallService::class.java)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) context.startForegroundService(intent)
      else context.startService(intent)
      promise.resolve(null)
    } catch (error: Exception) { promise.reject("CALL_SERVICE", "Open Envelo to connect your call.", error) }
  }
  @ReactMethod fun stop() { context.stopService(Intent(context, EnveloCallService::class.java)) }
  override fun invalidate() { stop(); super.invalidate() }
}

class EnveloCallPackage : ReactPackage {
  override fun createNativeModules(context: ReactApplicationContext): List<NativeModule> = listOf(EnveloCallModule(context))
  override fun createViewManagers(context: ReactApplicationContext): List<ViewManager<*, *>> = emptyList()
}
