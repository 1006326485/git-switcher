//! Menu-bar (tray) glyph, derived from the app icon.
//!
//! The tray used to reuse the full-colour app icon, which on macOS rendered as
//! a tiny dark rounded square with a cyan dial — the opposite of every other
//! menu-bar extra, which is a plain monochrome *template* image that the system
//! draws white on a dark menu bar and black on a light one.
//!
//! Rather than redraw the emblem, the tray reuses the icon's own geometry — a
//! full-bleed rounded square with a dial ring and its hand, measured off
//! `public/app-icon.png` — and inverts its tones:
//!
//! - the icon's dark plaque becomes the white silhouette, and
//! - the icon's bright cyan ring and hand are punched out transparent.
//!
//! That gives the same mark as the app icon, in the flat silhouette that a
//! template image needs. It is rasterised at the pixel size the menu bar asks
//! for, so the ring, the bore and the hand all stay crisp at 16pt; macOS is
//! then told to treat it as a template image (see the tray setup in `lib.rs`).

/// View box of the app icon, in points of its 512×512 raster; the glyph fills
/// it, since the icon's plaque is full bleed.
const ICON_SIZE: f64 = 512.0;
/// Corner radius of the icon's rounded square.
const PLAQUE_RADIUS: f64 = 116.0;
/// Radius of the dial ring's centreline, and its stroke width.
const RING_RADIUS: f64 = 160.0;
const RING_STROKE: f64 = 48.0;
/// The hand is a round-capped stroke from the dial's centre; its cap ends
/// where the ring's bore begins, so the hand touches the ring.
const HAND_STROKE: f64 = 48.0;
/// Supersampling factor per axis used to anti-alias the vector shapes.
const SUPERSAMPLE: u32 = 8;

/// Default bitmap size for the menu-bar glyph, in device pixels. 22pt is the
/// slot macOS gives menu-bar extras; at this size Tauri can scale the bitmap
/// down cleanly for 1x (16pt) displays and other window managers.
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
/// The plaque is covered; the ring and the hand are holes in it.
pub(crate) fn coverage(size: u32) -> Vec<u8> {
    let size = size.max(1);
    let scale = ICON_SIZE / size as f64;
    let centre = ICON_SIZE / 2.0;
    let hand = hand_tip();

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
                    let in_hand = distance_to_segment((x - centre, y - centre), (0.0, 0.0), hand)
                        <= HAND_STROKE / 2.0;
                    if in_plaque && !in_ring && !in_hand {
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

/// Far end of the hand, relative to the dial's centre: the icon's hand points
/// down-right, and its round cap ends where the ring's inner edge begins.
fn hand_tip() -> (f64, f64) {
    let step = (RING_RADIUS - RING_STROKE / 2.0) / std::f64::consts::SQRT_2;
    (step, step)
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
        img.rgba().chunks_exact(4).map(|p| p[3]).collect()
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
        for px in img.rgba().chunks_exact(4) {
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
        // Icon's dark plaque: the bore between the hand and the ring is white,
        // and so is the outer margin between the dial and the plaque edge.
        // (Down-left of the centre is clear of the hand, which points
        // down-right.)
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
        // Icon's bright cyan: the ring and the hand are punched out.
        assert_eq!(
            at(size, c, c - RING_RADIUS),
            0,
            "the ring (bright in the icon) should be clear"
        );
        let (tip_x, tip_y) = hand_tip();
        assert_eq!(
            at(size, c + tip_x * 0.6, c + tip_y * 0.6),
            0,
            "the hand (bright in the icon) should be clear"
        );
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
