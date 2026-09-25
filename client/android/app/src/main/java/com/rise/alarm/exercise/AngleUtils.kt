package com.rise.alarm.exercise

import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.atan2
import kotlin.math.sqrt

/**
 * Pure geometry utility for computing joint angles.
 * No Android or ML Kit dependencies — fully testable on JVM.
 */
object AngleUtils {

    /**
     * Computes the angle (in degrees) at point B, formed by the line segments A→B and C→B.
     *
     * For push-up detection, call as: computeAngle(shoulder, elbow, wrist)
     * to get the elbow angle.
     *
     * @param ax X coordinate of point A (e.g., shoulder)
     * @param ay Y coordinate of point A
     * @param bx X coordinate of point B (e.g., elbow — the vertex)
     * @param by Y coordinate of point B
     * @param cx X coordinate of point C (e.g., wrist)
     * @param cy Y coordinate of point C
     * @return Angle at B in degrees [0, 180], or NaN if points are coincident.
     */
    fun computeAngle(
        ax: Float, ay: Float,
        bx: Float, by: Float,
        cx: Float, cy: Float
    ): Double {
        val baX = (ax - bx).toDouble()
        val baY = (ay - by).toDouble()
        val bcX = (cx - bx).toDouble()
        val bcY = (cy - by).toDouble()

        val magBA = sqrt(baX * baX + baY * baY)
        val magBC = sqrt(bcX * bcX + bcY * bcY)

        if (magBA < 1e-6 || magBC < 1e-6) {
            return Double.NaN
        }

        val dot = baX * bcX + baY * bcY
        var cosAngle = dot / (magBA * magBC)

        // Clamp to avoid NaN from floating-point errors outside [-1, 1]
        cosAngle = cosAngle.coerceIn(-1.0, 1.0)

        return Math.toDegrees(kotlin.math.acos(cosAngle))
    }

    /**
     * Overload accepting LandmarkData triplet for convenience.
     */
    fun computeAngle(a: LandmarkData, b: LandmarkData, c: LandmarkData): Double {
        return computeAngle(a.x, a.y, b.x, b.y, c.x, c.y)
    }
}
