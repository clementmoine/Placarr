"""Unit tests for TCG Live extract helpers (no UnityFS / network)."""

from __future__ import annotations

from extract import build_keyed_cards, foil_manifest_to_shader


def test_foil_manifest_to_shader_longest_first():
    assert foil_manifest_to_shader("HoloFoil_Rainbow_Amplify_J") == "Rainbow"
    assert foil_manifest_to_shader("Standard_NonFoil_J") == "NonFoil"
    assert foil_manifest_to_shader("", "TPCi/Cards3D/HoloFoil/SvUltraGoldRainbow") == (
        "SvUltraGoldRainbow"
    )
    assert foil_manifest_to_shader("Unknown_XYZ") == ""


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
