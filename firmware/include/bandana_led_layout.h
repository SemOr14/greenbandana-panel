#pragma once
#include <stdint.h>

// Outside/front view. X right, Y down. Dimensions in mm.
// Assumes individually addressable LEDs and one-LED cut intervals.
// Pitch 16.5 mm is provisional; update after measuring the actual strip.
namespace BandanaMatrix {
constexpr uint8_t kLedCount = 31;
constexpr uint8_t kRows = 5;
constexpr uint8_t kGridWidth = 13;
constexpr float kLedPitchX = 16.5f;
constexpr float kRowPitchY = 14.8f;
constexpr uint8_t kRowCounts[kRows] = {6,6,7,6,6};
constexpr int8_t kIndexAt[kRows][kGridWidth] = {
    {-1,  0, -1,  1, -1,  2, -1,  3, -1,  4, -1,  5, -1},
    {-1, 11, -1, 10, -1,  9, -1,  8, -1,  7, -1,  6, -1},
    {12, -1, 13, -1, 14, -1, 15, -1, 16, -1, 17, -1, 18},
    {-1, 24, -1, 23, -1, 22, -1, 21, -1, 20, -1, 19, -1},
    {-1, 25, -1, 26, -1, 27, -1, 28, -1, 29, -1, 30, -1},
};
constexpr int8_t indexAt(uint8_t x, uint8_t y) {
    return (x < kGridWidth && y < kRows) ? kIndexAt[y][x] : -1;
}
struct LedPosition { float x_mm; float y_mm; };
constexpr LedPosition kPosition[kLedCount] = {
    {-41.250f, -29.600f}, // LED 0
    {-24.750f, -29.600f}, // LED 1
    {-8.250f, -29.600f}, // LED 2
    {8.250f, -29.600f}, // LED 3
    {24.750f, -29.600f}, // LED 4
    {41.250f, -29.600f}, // LED 5
    {41.250f, -14.800f}, // LED 6
    {24.750f, -14.800f}, // LED 7
    {8.250f, -14.800f}, // LED 8
    {-8.250f, -14.800f}, // LED 9
    {-24.750f, -14.800f}, // LED 10
    {-41.250f, -14.800f}, // LED 11
    {-49.500f, 0.000f}, // LED 12
    {-33.000f, 0.000f}, // LED 13
    {-16.500f, 0.000f}, // LED 14
    {0.000f, 0.000f}, // LED 15
    {16.500f, 0.000f}, // LED 16
    {33.000f, 0.000f}, // LED 17
    {49.500f, 0.000f}, // LED 18
    {41.250f, 14.800f}, // LED 19
    {24.750f, 14.800f}, // LED 20
    {8.250f, 14.800f}, // LED 21
    {-8.250f, 14.800f}, // LED 22
    {-24.750f, 14.800f}, // LED 23
    {-41.250f, 14.800f}, // LED 24
    {-41.250f, 29.600f}, // LED 25
    {-24.750f, 29.600f}, // LED 26
    {-8.250f, 29.600f}, // LED 27
    {8.250f, 29.600f}, // LED 28
    {24.750f, 29.600f}, // LED 29
    {41.250f, 29.600f}, // LED 30
};
} // namespace BandanaMatrix
