package com.rise.alarm;

import android.app.Activity;
import android.app.Application;
import android.os.Bundle;
import android.util.Log;

/**
 * Custom Application class tracking process lifecycle state via
 * Application.ActivityLifecycleCallbacks.
 */
public class RiseApplication extends Application implements Application.ActivityLifecycleCallbacks {
    private static final String TAG = "RiseApplication";
    private static RiseApplication instance;

    private static int startedActivitiesCount = 0;
    private static int resumedActivitiesCount = 0;

    @Override
    public void onCreate() {
        super.onCreate();
        instance = this;
        registerActivityLifecycleCallbacks(this);

        // Start network connectivity monitoring
        NetworkMonitor.getInstance(this).startMonitoring();
        Log.d(TAG, "RiseApplication initialized");
    }

    public static RiseApplication getInstance() {
        return instance;
    }

    /**
     * Checks if any activity in the application is currently started (visible in foreground).
     */
    public static boolean isAppInForeground() {
        return startedActivitiesCount > 0;
    }

    /**
     * Checks if any activity is currently resumed and interactive.
     */
    public static boolean isAppResumed() {
        return resumedActivitiesCount > 0;
    }

    @Override
    public void onActivityStarted(Activity activity) {
        startedActivitiesCount++;
        Log.d(TAG, "onActivityStarted: " + activity.getClass().getSimpleName() + ", total started=" + startedActivitiesCount);
    }

    @Override
    public void onActivityStopped(Activity activity) {
        startedActivitiesCount = Math.max(0, startedActivitiesCount - 1);
        Log.d(TAG, "onActivityStopped: " + activity.getClass().getSimpleName() + ", total started=" + startedActivitiesCount);
    }

    @Override
    public void onActivityResumed(Activity activity) {
        resumedActivitiesCount++;
        Log.d(TAG, "onActivityResumed: " + activity.getClass().getSimpleName() + ", total resumed=" + resumedActivitiesCount);
    }

    @Override
    public void onActivityPaused(Activity activity) {
        resumedActivitiesCount = Math.max(0, resumedActivitiesCount - 1);
        Log.d(TAG, "onActivityPaused: " + activity.getClass().getSimpleName() + ", total resumed=" + resumedActivitiesCount);
    }

    @Override
    public void onActivityCreated(Activity activity, Bundle savedInstanceState) {}

    @Override
    public void onActivitySaveInstanceState(Activity activity, Bundle outState) {}

    @Override
    public void onActivityDestroyed(Activity activity) {}
}
