//! Menu-bar (tray) glyph, derived from the app icon.
//!
//! The tray used to reuse the full-colour app icon, which on macOS rendered as
//! a tiny dark rounded square with a cyan dial — the opposite of every other
//! menu-bar extra, which is a plain monochrome *template* image that the system
//! draws white on a dark menu bar and black on a light one.
//!
//! Rather than redraw the emblem, the tray reuses the icon's own geometry — a
//! full-bleed rounded square with a dial ring and the bar across its bore,
//! measured off `public/app-icon.png` — and inverts its tones:
//!
//! - the icon's dark plaque becomes the white silhouette, and
//! - the icon's bright cyan ring and the diagonal bar are punched out
//!   transparent.
//!
//! That gives the same mark as the app icon, in the flat silhouette that a
//! template image needs. It is rasterised at one bitmap pixel per device pixel
//! of the 18pt menu-bar slot, so the ring, the bore and the bar all stay crisp
//! on a Retina bar; macOS is then told to treat it as a template image (see
//! the tray setup in `lib.rs`).

/// View box of the app icon, in points of its 512×512 raster; the glyph fills
/// it, since the icon's plaque is full bleed.
const ICON_SIZE: f64 = 512.0;
/// Corner radius of the icon's rounded square.
const PLAQUE_RADIUS: f64 = 116.0;
/// Radius of the dial ring's centreline, and its stroke width.
const RING_RADIUS: f64 = 160.0;
const RING_STROKE: f64 = 48.0;
/// The bar is a round-capped diagonal stroke that runs up-left to down-right
/// through the centre of the bore: the icon centres it on the dial rather than
/// hanging it off one side, so half of it shows on each side of the centre.
/// `BAR_STROKE` is its width (thinner than the ring) and `BAR_HALF_SPAN` is
/// half the distance between its two round caps' centres, measured along the
/// diagonal — short enough that white bore separates it from the ring.
const BAR_STROKE: f64 = 40.0;
const BAR_HALF_SPAN: f64 = 30.0;
/// Supersampling factor per axis used to anti-alias the vector shapes.
const SUPERSAMPLE: u32 = 8;

/// Bitmap size for the menu-bar glyph, in device pixels.
///
/// `tray-icon` lays a status item's image out 18pt tall on macOS whatever size
/// it is handed, so 36px is that 18pt slot at 2x — one bitmap pixel per device
/// pixel on a Retina bar. 22px (the old value) was upscaled to 36px there and
/// went soft; the other window managers draw the bitmap closer to 1:1, so they
/// keep the smaller one.
#[cfg(target_os = "macos")]
pub const MENU_BAR_ICON_SIZE: u32 = 36;

/// Bitmap size for the menu-bar glyph, in device pixels.
#[cfg(not(target_os = "macos"))]
pub const MENU_BAR_ICON_SIZE: u32 = 22;

/// Renders the glyph as a `size`×`size` [`Image`](tauri::image::Image). Covered
/// pixels are opaque white, everything else transparent: template images only
/// use coverage, but Tauri still wants RGBA, so white it is.
pub fn template_image(size: u32) -> tauri::image::Image<'static> {
    let size = size.max(1);
    let mut rgba = vec![0u8; (size * size * 4) as usize];
    for (i, alpha) in coverage(size).into_iter().enumerate() {
        if alpha == 0 {
            continue;
        }
        rgba[i * 4..i * 4 + 3].fill(255);
        rgba[i * 4 + 3] = alpha;
    }
    tauri::image::Image::new_owned(rgba, size, size)
}

/// Anti-aliased coverage mask (0–255), row-major, for a `size`×`size` bitmap.
/// The plaque is covered; the ring and the bar are holes in it.
pub(crate) fn coverage(size: u32) -> Vec<u8> {
    let size = size.max(1);
    let scale = ICON_SIZE / size as f64;
    let centre = ICON_SIZE / 2.0;
    let (bar_start, bar_end) = bar_caps();

    let n = SUPERSAMPLE;
    let total = (n * n) as f64;
    let mut out = vec![0u8; (size * size) as usize];
    for py in 0..size {
        for px in 0..size {
            let mut hits = 0u32;
            for sy in 0..n {
                for sx in 0..n {
                    // Sample point in the icon's own coordinate space.
                    let x = (px as f64 + (sx as f64 + 0.5) / n as f64) * scale;
                    let y = (py as f64 + (sy as f64 + 0.5) / n as f64) * scale;
                    let in_plaque = rounded_square(x, y, centre, ICON_SIZE / 2.0, PLAQUE_RADIUS);
                    let in_ring = {
                        let d = (x - centre).hypot(y - centre);
                        (RING_RADIUS - RING_STROKE / 2.0..=RING_RADIUS + RING_STROKE / 2.0)
                            .contains(&d)
                    };
                    let in_bar = distance_to_segment((x - centre, y - centre), bar_start, bar_end)
                        <= BAR_STROKE / 2.0;
                    if in_plaque && !in_ring && !in_bar {
                        hits += 1;
                    }
                }
            }
            out[(py * size + px) as usize] = (hits as f64 / total * 255.0).round() as u8;
        }
    }
    out
}

/// Whether a point in icon coordinates is inside the rounded square centred on
/// `(c, c)` with half-extent `half` and corner radius `radius`.
fn rounded_square(x: f64, y: f64, c: f64, half: f64, radius: f64) -> bool {
    // Distance outside the inset square on each axis, clamped at zero: only
    // the corner regions can then exceed `radius`.
    let (dx, dy) = (
        (x - c).abs() - (half - radius),
        (y - c).abs() - (half - radius),
    );
    let outside = dx.max(0.0).hypot(dy.max(0.0));
    (x - c).abs() <= half && (y - c).abs() <= half && outside <= radius
}

/// Near and far ends of the bar, relative to the dial's centre: the icon's bar
/// points down-right and is centred on the dial, so its round caps sit
/// symmetrically up-left and down-right of the centre.
fn bar_caps() -> ((f64, f64), (f64, f64)) {
    let step = BAR_HALF_SPAN / std::f64::consts::SQRT_2;
    ((-step, -step), (step, step))
}

/// Shortest distance from `p` to the segment `a`–`b`.
fn distance_to_segment(p: (f64, f64), a: (f64, f64), b: (f64, f64)) -> f64 {
    let (dx, dy) = (b.0 - a.0, b.1 - a.1);
    let len_sq = dx * dx + dy * dy;
    let t = if len_sq == 0.0 {
        0.0
    } else {
        (((p.0 - a.0) * dx + (p.1 - a.1) * dy) / len_sq).clamp(0.0, 1.0)
    };
    (p.0 - (a.0 + t * dx)).hypot(p.1 - (a.1 + t * dy))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn alpha(img: &tauri::image::Image<'_>) -> Vec<u8> {
        img.rgba().as_chunks::<4>().0.iter().map(|p| p[3]).collect()
    }

    fn ink(img: &tauri::image::Image<'_>) -> f64 {
        alpha(img).iter().map(|a| *a as f64).sum::<f64>() / 255.0
    }

    /// Coverage at a point in icon coordinates (0–512).
    fn at(size: u32, x: f64, y: f64) -> u8 {
        let px = (x / ICON_SIZE * size as f64) as u32;
        let py = (y / ICON_SIZE * size as f64) as u32;
        alpha(&template_image(size))[(py * size + px) as usize]
    }

    #[test]
    fn only_the_silhouette_is_drawn_and_it_is_white() {
        let img = template_image(32);
        assert_eq!((img.width(), img.height()), (32, 32));
        for px in img.rgba().as_chunks::<4>().0 {
            if px[3] == 0 {
                assert_eq!(&px[..3], &[0, 0, 0], "clear pixels must not be tinted");
            } else {
                assert_eq!(&px[..3], &[255, 255, 255], "template images are white only");
            }
        }
        assert!(ink(&img) > 100.0, "glyph should not be blank");
    }

    #[test]
    fn dark_regions_become_white_and_bright_regions_go_clear() {
        let size = 128;
        let c = ICON_SIZE / 2.0;
        // Icon's dark plaque: the bore around the bar is white, and so is the
        // outer margin between the dial and the plaque edge. (Up-left of the
        // bar's cap is clear of it, since the bar stops short of the ring.)
        assert!(
            at(size, c - 60.0, c - 60.0) > 240,
            "the bore (dark in the icon) should be white, got {}",
            at(size, c - 60.0, c - 60.0)
        );
        // Halfway between the ring's outer edge and the plaque's edge.
        assert_eq!(
            at(size, c, c - 220.0),
            255,
            "the plaque margin (dark in the icon) should be white"
        );
        // Icon's bright cyan: the ring and the bar are punched out.
        assert_eq!(
            at(size, c, c - RING_RADIUS),
            0,
            "the ring (bright in the icon) should be clear"
        );
        let ((start_x, start_y), (end_x, end_y)) = bar_caps();
        assert_eq!(
            at(size, c + end_x * 0.6, c + end_y * 0.6),
            0,
            "the bar's down-right half (bright in the icon) should be clear"
        );
        assert_eq!(
            at(size, c + start_x * 0.6, c + start_y * 0.6),
            0,
            "the bar's up-left half (bright in the icon) should be clear"
        );
    }

    #[test]
    fn the_bar_is_centred_on_the_dial() {
        // The app icon's bar is a slash through the middle of the bore, not a
        // hand hanging off the centre: the glyph therefore has 180° rotational
        // symmetry about the dial's centre. Hanging the bar off one side (as an
        // earlier version did) leaves only the other side white and breaks this.
        for size in [MENU_BAR_ICON_SIZE, 64] {
            let a = alpha(&template_image(size));
            for py in 0..size {
                for px in 0..size {
                    let opposite = ((size - 1 - py) * size + (size - 1 - px)) as usize;
                    let here = (py * size + px) as usize;
                    assert!(
                        (a[here] as i32 - a[opposite] as i32).abs() <= 2,
                        "at {size}px pixel ({px}, {py}) is {} but its opposite is {}",
                        a[here],
                        a[opposite]
                    );
                }
            }
        }
    }

    #[test]
    fn the_bar_keeps_clear_of_the_ring_on_both_sides() {
        // White bore separates each of the bar's caps from the ring's inner
        // edge, and the bar runs straight through the dial's centre.
        let size = 128;
        let c = ICON_SIZE / 2.0;
        let bore = RING_RADIUS - RING_STROKE / 2.0;
        let reach = BAR_HALF_SPAN + BAR_STROKE / 2.0;
        assert!(reach < bore, "the bar must not touch the ring");
        let between = (reach + bore) / 2.0 / std::f64::consts::SQRT_2;
        for sign in [-1.0, 1.0] {
            assert_eq!(
                at(size, c + sign * between, c + sign * between),
                255,
                "the bore between the bar and the ring should be white (sign {sign})"
            );
        }
        assert_eq!(at(size, c, c), 0, "the bar runs through the dial's centre");
    }

    #[test]
    fn corners_are_rounded_like_the_app_icon() {
        // The plaque is full bleed, but its corners are cut away.
        let size = 128;
        assert_eq!(at(size, 2.0, 2.0), 0, "plaque corner should be clear");
        assert_eq!(
            at(size, ICON_SIZE / 2.0, 2.0),
            255,
            "plaque edge midpoint should be solid"
        );
    }

    #[test]
    fn edges_are_antialiased() {
        let img = template_image(44);
        let partial = alpha(&img)
            .into_iter()
            .filter(|a| (9..=246).contains(a))
            .count();
        assert!(
            partial > 24,
            "a retina glyph should have soft edges, found {partial} partial pixels"
        );
    }

    #[test]
    fn glyph_fills_its_slot() {
        for size in [16, 22, 32, 44] {
            let img = template_image(size);
            let a = alpha(&img);
            let w = size as usize;
            let (mut x0, mut y0, mut x1, mut y1) = (w, w, 0, 0);
            for (i, v) in a.iter().enumerate() {
                if *v > 8 {
                    let (x, y) = (i % w, i / w);
                    x0 = x0.min(x);
                    y0 = y0.min(y);
                    x1 = x1.max(x);
                    y1 = y1.max(y);
                }
            }
            assert_eq!(
                (x0, y0, x1, y1),
                (0, 0, w - 1, w - 1),
                "{size}px glyph should fill the slot like the app icon does"
            );
        }
    }

    #[test]
    fn denser_bitmaps_scale_the_ink() {
        for size in [16, 22, 32] {
            let small = ink(&template_image(size));
            let big = ink(&template_image(size * 2));
            let expected = small * 4.0;
            assert!(
                (expected * 0.9..=expected * 1.1).contains(&big),
                "{size}px->{}px ink should scale, {expected:.1} vs {big:.1}",
                size * 2
            );
        }
    }

    #[test]
    fn degenerate_sizes_do_not_panic() {
        assert_eq!(template_image(0).width(), 1);
        assert_eq!(template_image(1).width(), 1);
    }
}
