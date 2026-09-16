package com.rise.alarm;

import android.content.Context;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.NetworkRequest;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;

import androidx.annotation.NonNull;

import java.util.Collections;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Singleton network monitor that uses ConnectivityManager.NetworkCallback.
 * Validates networks with NET_CAPABILITY_INTERNET and NET_CAPABILITY_VALIDATED.
 */
public class NetworkMonitor {
    private static final String TAG = "RiseNetworkMonitor";
    private static volatile NetworkMonitor instance;

    private final Context context;
    private final ConnectivityManager connectivityManager;
    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private final Set<NetworkStatusListener> listeners = Collections.newSetFromMap(new ConcurrentHashMap<>());

    private ConnectivityManager.NetworkCallback networkCallback;
    private volatile boolean isOnline = false;
    private boolean isRegistered = false;

    public interface NetworkStatusListener {
        void onNetworkStatusChanged(boolean isOnline);
    }

    private NetworkMonitor(Context context) {
        this.context = context.getApplicationContext();
        this.connectivityManager = (ConnectivityManager) this.context.getSystemService(Context.CONNECTIVITY_SERVICE);
    }

    public static NetworkMonitor getInstance(Context context) {
        if (instance == null) {
            synchronized (NetworkMonitor.class) {
                if (instance == null) {
                    instance = new NetworkMonitor(context);
                }
            }
        }
        return instance;
    }

    public synchronized void startMonitoring() {
        if (isRegistered || connectivityManager == null) {
            return;
        }

        // 1. Seed initial value immediately at registration time
        seedInitialValue();

        // 2. Register network callback
        networkCallback = new ConnectivityManager.NetworkCallback() {
            @Override
            public void onAvailable(@NonNull Network network) {
                Log.d(TAG, "Network onAvailable: " + network);
                checkAndUpdateConnectivity(network);
            }

            @Override
            public void onCapabilitiesChanged(@NonNull Network network, @NonNull NetworkCapabilities capabilities) {
                boolean validated = capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) &&
                                    capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED);
                Log.d(TAG, "Network onCapabilitiesChanged: validated=" + validated);
                setOnline(validated);
            }

            @Override
            public void onLost(@NonNull Network network) {
                Log.d(TAG, "Network onLost: " + network);
                // Re-check active network
                seedInitialValue();
            }
        };

        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                connectivityManager.registerDefaultNetworkCallback(networkCallback);
            } else {
                NetworkRequest request = new NetworkRequest.Builder()
                    .addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
                    .build();
                connectivityManager.registerNetworkCallback(request, networkCallback);
            }
            isRegistered = true;
            Log.d(TAG, "NetworkCallback registered successfully. Initial isOnline=" + isOnline);
        } catch (Exception e) {
            Log.e(TAG, "Failed to register network callback", e);
        }
    }

    public synchronized void stopMonitoring() {
        if (!isRegistered || connectivityManager == null || networkCallback == null) {
            return;
        }
        try {
            connectivityManager.unregisterNetworkCallback(networkCallback);
            isRegistered = false;
            networkCallback = null;
            Log.d(TAG, "NetworkCallback unregistered to avoid leaks");
        } catch (Exception e) {
            Log.e(TAG, "Failed to unregister network callback", e);
        }
    }

    private void seedInitialValue() {
        if (connectivityManager == null) {
            setOnline(false);
            return;
        }

        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                Network activeNet = connectivityManager.getActiveNetwork();
                if (activeNet != null) {
                    NetworkCapabilities caps = connectivityManager.getNetworkCapabilities(activeNet);
                    boolean validated = caps != null &&
                        caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) &&
                        caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED);
                    setOnline(validated);
                    return;
                }
            } else {
                android.net.NetworkInfo info = connectivityManager.getActiveNetworkInfo();
                setOnline(info != null && info.isConnected());
                return;
            }
        } catch (Exception e) {
            Log.w(TAG, "Error seeding initial network connectivity", e);
        }
        setOnline(false);
    }

    private void checkAndUpdateConnectivity(Network network) {
        if (connectivityManager == null || network == null) return;
        try {
            NetworkCapabilities caps = connectivityManager.getNetworkCapabilities(network);
            boolean validated = caps != null &&
                caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) &&
                caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED);
            setOnline(validated);
        } catch (Exception e) {
            Log.w(TAG, "checkAndUpdateConnectivity error", e);
        }
    }

    private void setOnline(boolean online) {
        if (this.isOnline == online && isRegistered) {
            return;
        }
        this.isOnline = online;
        Log.d(TAG, "Network connectivity updated: isOnline=" + online);
        notifyListeners(online);
    }

    private void notifyListeners(final boolean online) {
        mainHandler.post(() -> {
            for (NetworkStatusListener listener : listeners) {
                try {
                    listener.onNetworkStatusChanged(online);
                } catch (Exception e) {
                    Log.e(TAG, "Error notifying network listener", e);
                }
            }
        });
    }

    public boolean isOnline() {
        return isOnline;
    }

    public void addListener(NetworkStatusListener listener) {
        if (listener != null) {
            listeners.add(listener);
            // Immediately notify listener of current state
            listener.onNetworkStatusChanged(isOnline);
        }
    }

    public void removeListener(NetworkStatusListener listener) {
        if (listener != null) {
            listeners.remove(listener);
        }
    }
}
