
package expo.modules.duwekku_notification_listener

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.provider.Settings
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import android.app.Notification
import org.json.JSONArray
import org.json.JSONObject
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.util.Locale

private const val PREFS_NAME = "duwekku_notification_listener"
private const val PENDING_KEY = "pending_notifications"
private const val SEEN_KEY = "seen_notification_ids"

class DuwekkuNotificationListener : Module() {
  override fun definition() = ModuleDefinition {
    Name("duwekku-notification-listener")

    Function("isNotificationAccessEnabled") {
      val context = appContext.reactContext ?: return@Function false
      val enabled = Settings.Secure.getString(
        context.contentResolver,
        "enabled_notification_listeners"
      ).orEmpty()

      val expected = ComponentName(
        context,
        DuwekkuNotificationService::class.java
      ).flattenToString()

      enabled.split(":").any { it.equals(expected, ignoreCase = true) }
    }

    Function("openNotificationAccessSettings") {
      val context = appContext.reactContext
        ?: throw IllegalStateException("React context belum tersedia")

      context.startActivity(
        Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS).apply {
          addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
      )
    }

    Function("getPendingNotifications") {
      val context = appContext.reactContext
        ?: return@Function emptyList<Map<String, Any>>()

      val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
      val pending = runCatching {
        JSONArray(prefs.getString(PENDING_KEY, "[]"))
      }.getOrElse { JSONArray() }

      prefs.edit().remove(PENDING_KEY).apply()

      (0 until pending.length()).mapNotNull { index ->
        val item = pending.optJSONObject(index) ?: return@mapNotNull null
        mapOf(
          "id" to item.optString("id"),
          "packageName" to item.optString("packageName"),
          "title" to item.optString("title"),
          "text" to item.optString("text"),
          "timestamp" to item.optLong("timestamp")
        )
      }
    }
  }
}

class DuwekkuNotificationService : NotificationListenerService() {
  override fun onNotificationPosted(sbn: StatusBarNotification) {
    super.onNotificationPosted(sbn)

    if (sbn.packageName == packageName) return

    val extras = sbn.notification.extras ?: return
    val title = extras.getCharSequence(Notification.EXTRA_TITLE)
      ?.toString()?.trim().orEmpty()
    val text = (
      extras.getCharSequence(Notification.EXTRA_BIG_TEXT)
        ?: extras.getCharSequence(Notification.EXTRA_TEXT)
      )?.toString()?.trim().orEmpty()

    val combined = "$title $text"
    if (!isPaymentCandidate(combined)) return

    val prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    val id = "${sbn.packageName}:${sbn.postTime}:${sbn.id}:${sbn.tag.orEmpty()}"

    val seen = runCatching {
      JSONArray(prefs.getString(SEEN_KEY, "[]"))
    }.getOrElse { JSONArray() }

    if ((0 until seen.length()).any { seen.optString(it) == id }) return

    seen.put(id)
    while (seen.length() > 200) seen.remove(0)

    val pending = runCatching {
      JSONArray(prefs.getString(PENDING_KEY, "[]"))
    }.getOrElse { JSONArray() }

    pending.put(
      JSONObject()
        .put("id", id)
        .put("packageName", sbn.packageName)
        .put("title", title)
        .put("text", text)
        .put("timestamp", sbn.postTime)
    )

    while (pending.length() > 50) pending.remove(0)

    prefs.edit()
      .putString(SEEN_KEY, seen.toString())
      .putString(PENDING_KEY, pending.toString())
      .apply()
  }

  private fun isPaymentCandidate(text: String): Boolean {
    if (text.isBlank()) return false

    val normalized = text.lowercase(Locale.ROOT)
    val excluded = listOf(
      "otp", "kode verifikasi", "kode keamanan",
      "verification code", "one-time password"
    )
    if (excluded.any { normalized.contains(it) }) return false

    val keywords = listOf(
      "transfer", "pembayaran", "dibayar", "diterima",
      "menerima", "top up", "top-up", "qris", "saldo",
      "payment", "paid", "received", "purchase", "debit",
      "credit", "transaksi", "transaction", "pembelian",
      "mutasi", "uang masuk", "uang keluar"
    )

    val hasKeyword = keywords.any { normalized.contains(it) }
    val hasAmount = Regex(
      """(?:rp\.?\s*|idr\s*)?\d[\d.,]*(?:\s*(?:rb|ribu|jt|juta))""",
      RegexOption.IGNORE_CASE
    ).containsMatchIn(text) ||
      Regex(
        """\b(?:rp|idr)\.?\s*\d[\d.,]*""",
        RegexOption.IGNORE_CASE
      ).containsMatchIn(text)

    return hasKeyword && hasAmount
  }
}
