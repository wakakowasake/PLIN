# Add project specific ProGuard rules here.
# By default, the flags in this file are appended to flags specified
# in /usr/local/Cellar/android-sdk/24.3.3/tools/proguard/proguard-android.txt
# You can edit the include path and order by changing the proguardFiles
# directive in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# React Native core
-keep class com.facebook.react.** { *; }
-keep class com.facebook.jni.** { *; }

# Firebase and Google Play Services use reflection in several Android paths.
-keep class com.google.firebase.** { *; }
-keep class com.google.android.gms.** { *; }
-dontwarn com.google.firebase.ktx.Firebase

# Expo modules
-keep class expo.modules.** { *; }

# Native IAP and WebView modules are part of purchase/support flows.
-keep class expo.modules.iap.** { *; }
-keep class com.reactnativecommunity.webview.** { *; }

# Hermes
-keep class com.facebook.hermes.** { *; }

# Kotlin
-keep class kotlin.** { *; }

# JSON parsing safety
-keepclassmembers class * {
  @com.google.gson.annotations.SerializedName <fields>;
}

# react-native-reanimated
-keep class com.swmansion.reanimated.** { *; }
-keep class com.facebook.react.turbomodule.** { *; }

# Add any project specific keep options here:
