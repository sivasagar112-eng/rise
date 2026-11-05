package com.rise.alarm

import android.content.Context
import androidx.credentials.CredentialManager
import androidx.credentials.CustomCredential
import androidx.credentials.GetCredentialRequest
import androidx.credentials.GetCredentialResponse
import androidx.credentials.exceptions.GetCredentialCancellationException
import androidx.credentials.exceptions.GetCredentialException
import androidx.credentials.exceptions.NoCredentialException
import com.google.android.libraries.identity.googleid.GetGoogleIdOption
import com.google.android.libraries.identity.googleid.GetSignInWithGoogleOption
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.auth.FirebaseUser
import com.google.firebase.auth.GoogleAuthProvider
import kotlinx.coroutines.tasks.await

object GoogleSignInHelper {
    // Client ID from google-services.json (client_type: 3 - Web application)
    private const val WEB_CLIENT_ID = "426213239028-p695ebmkpqrr2a3eagevnhrcjd9vu4eg.apps.googleusercontent.com"

    suspend fun signInWithGoogle(context: Context): Result<FirebaseUser> {
        val credentialManager = CredentialManager.create(context)

        // 1. Primary approach for explicit button clicks: GetSignInWithGoogleOption
        // This is specifically designed for user-initiated sign-in and forces the Google account picker bottom sheet
        try {
            val signInOption = GetSignInWithGoogleOption.Builder(serverClientId = WEB_CLIENT_ID)
                .build()

            val request = GetCredentialRequest.Builder()
                .addCredentialOption(signInOption)
                .build()

            val result = credentialManager.getCredential(
                request = request,
                context = context
            )
            return handleCredentialResult(result)
        } catch (e: GetCredentialCancellationException) {
            return Result.failure(Exception("Sign-in was cancelled"))
        } catch (e: NoCredentialException) {
            // 2. Fallback to GetGoogleIdOption with filterByAuthorizedAccounts = false
            return tryFallbackGoogleIdOption(credentialManager, context)
        } catch (e: Exception) {
            val fallback = tryFallbackGoogleIdOption(credentialManager, context)
            if (fallback.isSuccess) {
                return fallback
            }
            return Result.failure(e)
        }
    }

    private suspend fun tryFallbackGoogleIdOption(credentialManager: CredentialManager, context: Context): Result<FirebaseUser> {
        return try {
            val googleIdOption = GetGoogleIdOption.Builder()
                .setFilterByAuthorizedAccounts(false)
                .setServerClientId(WEB_CLIENT_ID)
                .setAutoSelectEnabled(false)
                .build()

            val request = GetCredentialRequest.Builder()
                .addCredentialOption(googleIdOption)
                .build()

            val result = credentialManager.getCredential(
                request = request,
                context = context
            )
            handleCredentialResult(result)
        } catch (e: GetCredentialCancellationException) {
            Result.failure(Exception("Sign-in was cancelled"))
        } catch (e: NoCredentialException) {
            Result.failure(Exception("No Google account found on this device. Please ensure a Google account is logged into your phone Settings and try again."))
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    private suspend fun handleCredentialResult(result: GetCredentialResponse): Result<FirebaseUser> {
        val credential = result.credential
        if (credential is CustomCredential &&
            credential.type == GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL
        ) {
            val googleIdTokenCredential = GoogleIdTokenCredential.createFrom(credential.data)
            val idToken = googleIdTokenCredential.idToken

            val firebaseCredential = GoogleAuthProvider.getCredential(idToken, null)
            val authResult = FirebaseAuth.getInstance().signInWithCredential(firebaseCredential).await()
            val user = authResult.user
            return if (user != null) {
                Result.success(user)
            } else {
                Result.failure(Exception("Firebase user is null after sign in"))
            }
        } else {
            return Result.failure(Exception("Unexpected credential type: ${credential::class.java.name}"))
        }
    }
}

