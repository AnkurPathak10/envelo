package com.envelo.notifications

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.BitmapShader
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Matrix
import android.graphics.Paint
import android.graphics.Shader
import android.graphics.Typeface
import android.util.LruCache
import java.net.HttpURLConnection
import java.net.URL
import java.util.Locale
import kotlin.math.max

internal object NotificationAvatar {
  private const val SIZE = 128
  private const val MAX_BYTES = 2 * 1024 * 1024
  private val cache = LruCache<String, Bitmap>(24)

  fun load(url: String?, name: String): Bitmap {
    if (!url.isNullOrBlank() && url.startsWith("https://")) {
      cache.get(url)?.let { return it }
      val downloaded = runCatching { download(url) }.getOrNull()
      if (downloaded != null) {
        val avatar = circular(downloaded)
        downloaded.recycle()
        cache.put(url, avatar)
        return avatar
      }
    }
    return initials(name)
  }

  private fun download(value: String): Bitmap? {
    val connection = URL(value).openConnection() as HttpURLConnection
    connection.connectTimeout = 2000
    connection.readTimeout = 2000
    connection.instanceFollowRedirects = false
    try {
      if (connection.responseCode != 200 || connection.contentLength > MAX_BYTES) return null
      val bytes = connection.inputStream.use { it.readBytesBounded() } ?: return null
      val options = BitmapFactory.Options().apply { inJustDecodeBounds = true }
      BitmapFactory.decodeByteArray(bytes, 0, bytes.size, options)
      if (options.outWidth <= 0 || options.outHeight <= 0) return null
      options.inSampleSize = 1
      while (max(options.outWidth, options.outHeight) / options.inSampleSize > SIZE * 2) {
        options.inSampleSize *= 2
      }
      options.inJustDecodeBounds = false
      return BitmapFactory.decodeByteArray(bytes, 0, bytes.size, options)
    } finally {
      connection.disconnect()
    }
  }

  private fun java.io.InputStream.readBytesBounded(): ByteArray? {
    val output = java.io.ByteArrayOutputStream()
    val buffer = ByteArray(8192)
    val deadline = System.nanoTime() + 2_000_000_000L
    while (true) {
      val count = read(buffer)
      if (count < 0) return output.toByteArray()
      if (output.size() + count > MAX_BYTES || System.nanoTime() > deadline) return null
      output.write(buffer, 0, count)
    }
  }

  private fun circular(source: Bitmap): Bitmap {
    val result = Bitmap.createBitmap(SIZE, SIZE, Bitmap.Config.ARGB_8888)
    val scale = max(SIZE.toFloat() / source.width, SIZE.toFloat() / source.height)
    val matrix = Matrix().apply {
      setScale(scale, scale)
      postTranslate((SIZE - source.width * scale) / 2, (SIZE - source.height * scale) / 2)
    }
    val shader = BitmapShader(source, Shader.TileMode.CLAMP, Shader.TileMode.CLAMP).apply {
      setLocalMatrix(matrix)
    }
    Canvas(result).drawCircle(SIZE / 2f, SIZE / 2f, SIZE / 2f,
      Paint(Paint.ANTI_ALIAS_FLAG).apply { this.shader = shader })
    return result
  }

  private fun initials(name: String): Bitmap {
    val result = Bitmap.createBitmap(SIZE, SIZE, Bitmap.Config.ARGB_8888)
    val canvas = Canvas(result)
    val paint = Paint(Paint.ANTI_ALIAS_FLAG)
    paint.color = Color.rgb(227, 196, 201)
    canvas.drawCircle(SIZE / 2f, SIZE / 2f, SIZE / 2f, paint)
    val text = name.trim().split(Regex("\\s+")).filter { it.isNotEmpty() }
      .take(2).joinToString("") { String(Character.toChars(it.codePointAt(0))) }
      .uppercase(Locale.ROOT).ifEmpty { "?" }
    paint.color = Color.rgb(36, 35, 38)
    paint.textSize = 46f
    paint.typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
    paint.textAlign = Paint.Align.CENTER
    canvas.drawText(text, SIZE / 2f, SIZE / 2f - (paint.ascent() + paint.descent()) / 2f, paint)
    return result
  }
}
