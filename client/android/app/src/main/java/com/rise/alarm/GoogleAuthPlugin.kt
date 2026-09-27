package com.rise.alarm

import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.google.firebase.auth.FirebaseAuth
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

@CapacitorPlugin(name = "GoogleAuth")
class GoogleAuthPlugin : Plugin() {

    @PluginMethod
    fun signIn(call: PluginCall) {
        val currentActivity = activity ?: run {
            call.reject("Activity is not available")
            return
        }

        CoroutineScope(Dispatchers.Main).launch {
            try {
                val result = GoogleSignInHelper.signInWithGoogle(currentActivity)
                result.onSuccess { user ->
                    val ret = JSObject()
                    ret.put("uid", user.uid)
                    ret.put("email", user.email ?: "")
                    ret.put("displayName", user.displayName ?: "")
                    ret.put("photoUrl", user.photoUrl?.toString() ?: "")
                    call.resolve(ret)
                }.onFailure { e ->
                    call.reject(e.message ?: "Sign in failed", e as? Exception ?: Exception(e.message))
                }
            } catch (e: Exception) {
                call.reject(e.message ?: "Sign in failed with exception", e)
            }
        }
    }

    @PluginMethod
    fun signOut(call: PluginCall) {
        try {
            FirebaseAuth.getInstance().signOut()
            call.resolve()
        } catch (e: Exception) {
            call.reject(e.message ?: "Sign out failed", e)
        }
    }

    @PluginMethod
    fun getCurrentUser(call: PluginCall) {
        val user = FirebaseAuth.getInstance().currentUser
        if (user != null) {
            val ret = JSObject()
            ret.put("uid", user.uid)
            ret.put("email", user.email ?: "")
            ret.put("displayName", user.displayName ?: "")
            ret.put("photoUrl", user.photoUrl?.toString() ?: "")
            call.resolve(ret)
        } else {
            call.resolve(JSObject())
        }
    }
}
