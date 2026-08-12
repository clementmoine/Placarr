"""Unit tests for TCG Live extract helpers (no UnityFS / network)."""

from __future__ import annotations

from pathlib import Path

from extract import (
    build_keyed_cards,
    canonical_face_filename,
    canonical_mask_tex_name,
    cleanup_misfiled_face_textures,
    foil_manifest_to_shader,
    reconcile_mask_tex,
)


def test_foil_manifest_to_shader_longest_first():
    assert foil_manifest_to_shader("HoloFoil_Rainbow_Amplify_J") == "Rainbow"
    assert foil_manifest_to_shader("Standard_NonFoil_J") == "NonFoil"
    assert foil_manifest_to_shader("", "TPCi/Cards3D/HoloFoil/SvUltraGoldRainbow") == (
        "SvUltraGoldRainbow"
    )
    assert foil_manifest_to_shader("Unknown_XYZ") == ""
    # Live inserts underscores inside CamelCase (parity with foilNames.ts).
    assert foil_manifest_to_shader("HoloFoil_Cracked_Ice_Amplify_J") == "CrackedIce"


def test_reconcile_mask_tex_clears_unshipped_and_fixes_pcd_wp_typo():
    assert canonical_mask_tex_name("sm1_pcd_wp_de_011") == "sm1_wp_pcd_de_011"
    # smalt_de_005: typo name + texture absent from the UnityFS → empty.
    assert reconcile_mask_tex("sm1_pcd_wp_de_011", {"sm1_de_011_td"}) == ""
    # Typo in the manifest, correct Texture2D name present.
    assert (
        reconcile_mask_tex("sm1_pcd_wp_de_011", {"sm1_wp_pcd_de_011", "sm1_de_011_td"})
        == "sm1_wp_pcd_de_011"
    )
    assert reconcile_mask_tex("bw10_wp_ph_fr_001", {"bw10_wp_ph_fr_001"}) == (
        "bw10_wp_ph_fr_001"
    )


def test_build_keyed_cards_merges_std_and_ph():
    rows = [
        {
            "bundle": "bw10_fr_001",
            "variant": "std",
            "foil": "Standard_NonFoil_J",
            "shaderPath": "TPCi/Cards3D/Standard/NonFoil",
            "cardTex": "bw10_fr_001",
            "maskTex": "",
        },
        {
            "bundle": "bw10_fr_001",
            "variant": "ph",
            "foil": "HoloFoil_Rainbow_Amplify_J",
            "shaderPath": "",
            "cardTex": "bw10_fr_001",
            "maskTex": "bw10_wp_ph_fr_001",
        },
    ]
    keyed = build_keyed_cards(rows)
    assert set(keyed["bw10_fr_001"]) == {"std", "ph"}
    assert keyed["bw10_fr_001"]["ph"]["shader"] == "Rainbow"
    assert keyed["bw10_fr_001"]["std"]["shader"] == "NonFoil"


def test_texture_mode_default_is_cards():
    import inspect

    from extract import extract_all, extract_card_bundle

    assert (
        inspect.signature(extract_card_bundle).parameters["texture_mode"].default
        == "cards"
    )
    assert inspect.signature(extract_all).parameters["texture_mode"].default == "cards"


def test_card_back_names_include_live_texture():
    from card_back import CARD_BACK_NAMES

    assert "cardback" in CARD_BACK_NAMES


def test_canonical_face_filename_uses_full_bundle_stem():
    assert canonical_face_filename("swsh10_it_008", "swsh10_it_008") == "art.webp"
    # Regression: textures_dir.name was ``008`` → art misfiled as extra-*.
    assert (
        canonical_face_filename("008", "swsh10_it_008") == "extra-swsh10_it_008.webp"
    )
    assert (
        canonical_face_filename("sm2_ptbr_160", "sm2_wp_ptbr_160") == "mask.webp"
    )
    assert (
        canonical_face_filename("sm2_ptbr_160", "sm2_wp_ph_ptbr_160") == "mask-ph.webp"
    )
    assert (
        canonical_face_filename("sm2_ptbr_160", "sm2_etch_ptbr_160") == "etch.webp"
    )
    assert (
        canonical_face_filename("xyalt_es_092", "xy4_es_031_op")
        == "extra-xy4_es_031_op.webp"
    )
    # Cross-stem MaterialManifest _c (mealt → me2-5 alt) must be art.webp.
    assert (
        canonical_face_filename(
            "mealt_fr_010", "me2-5_fr_153_alt", as_art=True
        )
        == "art.webp"
    )


def test_cleanup_misfiled_face_textures(tmp_path: Path):
    card = tmp_path / "swsh10" / "it" / "008"
    card.mkdir(parents=True)
    (card / "art.webp").write_bytes(b"RIFF....WEBP")
    bogus = card / "extra-swsh10_it_008.webp"
    bogus.write_bytes(b"RIFF....WEBP")
    (card / "extra-other.webp").write_bytes(b"keep")

    report = cleanup_misfiled_face_textures(tmp_path)
    assert report["removedDupExtras"] == 1
    assert not bogus.exists()
    assert (card / "art.webp").is_file()
    assert (card / "extra-other.webp").is_file()

    promote_dir = tmp_path / "me3" / "en" / "104"
    promote_dir.mkdir(parents=True)
    promote_bogus = promote_dir / "extra-me3_en_104.webp"
    promote_bogus.write_bytes(b"ARTBYTES")
    report2 = cleanup_misfiled_face_textures(tmp_path)
    assert report2["promotedExtrasToArt"] == 1
    assert not promote_bogus.exists()
    assert (promote_dir / "art.webp").read_bytes() == b"ARTBYTES"

    empty_dir = tmp_path / "xy12" / "fr" / "016"
    empty_dir.mkdir(parents=True)
    (empty_dir / "art.webp").write_bytes(b"ok")
    empty_extra = empty_dir / "extra-xy12_fr_016.webp"
    empty_extra.write_bytes(b"")
    empty_mask = empty_dir / "mask.webp"
    empty_mask.write_bytes(b"")
    report3 = cleanup_misfiled_face_textures(tmp_path)
    assert report3["removedEmpty"] >= 1
    assert not empty_extra.exists()
    assert not empty_mask.exists()
    assert (empty_dir / "art.webp").is_file()

    # Cross-stem cardTex leftover — promote sole extra, never delete the card dir.
    cross = tmp_path / "mealt" / "fr" / "010"
    cross.mkdir(parents=True)
    sole = cross / "extra-me2-5_fr_153_alt.webp"
    sole.write_bytes(b"CROSSART")
    (cross / "mask.webp").write_bytes(b"mask")
    report4 = cleanup_misfiled_face_textures(tmp_path)
    assert report4["promotedExtrasToArt"] >= 1
    assert not sole.exists()
    assert (cross / "art.webp").read_bytes() == b"CROSSART"
    assert cross.is_dir()
    assert (cross / "mask.webp").is_file()
