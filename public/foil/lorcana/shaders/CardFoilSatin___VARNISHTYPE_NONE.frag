#version 300 es

precision highp float;
precision highp int;
#define HLSLCC_ENABLE_UNIFORM_BUFFERS 0
#if HLSLCC_ENABLE_UNIFORM_BUFFERS
#define UNITY_UNIFORM
#else
#define UNITY_UNIFORM uniform
#endif
#define UNITY_SUPPORTS_UNIFORM_LOCATION 0
#if UNITY_SUPPORTS_UNIFORM_LOCATION
#define UNITY_LOCATION(x) layout(location = x)
#define UNITY_BINDING(x) layout(binding = x, std140)
#else
#define UNITY_LOCATION(x)
#define UNITY_BINDING(x) layout(std140)
#endif
#if HLSLCC_ENABLE_UNIFORM_BUFFERS
UNITY_BINDING(0) uniform UnityPerMaterial {
#endif
	UNITY_UNIFORM vec4 Xhlslcc_UnusedX_CalculateVarnishLayers_32b038f47e684388a3378904b95b91d3_DistortionTex_3454849507_Texture2D_TexelSize;
	UNITY_UNIFORM vec4 Xhlslcc_UnusedX_SampleTexture2D_ecaa018932e843b68c4797464457ac07_Texture_1_Texture2D_TexelSize;
	UNITY_UNIFORM vec4 Xhlslcc_UnusedX_SampleTexture2D_f44e690f3f3541a884ac95936014fc30_Texture_1_Texture2D_TexelSize;
	UNITY_UNIFORM vec4 Xhlslcc_UnusedX_Texture2DAsset_450a32acbdb1461b842432479265bb3d_Out_0_Texture2D_TexelSize;
	UNITY_UNIFORM vec4 Xhlslcc_UnusedX_Motif_TexelSize;
	UNITY_UNIFORM float Xhlslcc_UnusedX_TimeFactor;
	UNITY_UNIFORM vec4 Xhlslcc_UnusedX_MotifMask_TexelSize;
	UNITY_UNIFORM vec2                _Tilt;
	UNITY_UNIFORM float                _DeviceRotationDegrees;
	UNITY_UNIFORM vec4 Xhlslcc_UnusedX_RainbowGradientTex_TexelSize;
	UNITY_UNIFORM float                _FoilDisplacementStrength;
	UNITY_UNIFORM float Xhlslcc_UnusedX_VarnishHighlightStrength;
	UNITY_UNIFORM vec2 Xhlslcc_UnusedX_VarnishDistortionTiling;
	UNITY_UNIFORM float Xhlslcc_UnusedX_VarnishDistortionStrength;
	UNITY_UNIFORM float Xhlslcc_UnusedX_VarnishBevelStrength;
	UNITY_UNIFORM vec4 Xhlslcc_UnusedX_VarnishShineTex_TexelSize;
	UNITY_UNIFORM vec4 Xhlslcc_UnusedX_VarnishLightColor;
	UNITY_UNIFORM float Xhlslcc_UnusedX_VarnishOffset;
	UNITY_UNIFORM float Xhlslcc_UnusedX_VarnishOutlineStrength;
	UNITY_UNIFORM float Xhlslcc_UnusedX_VarnishDarkenStrength;
	UNITY_UNIFORM vec4 Xhlslcc_UnusedX_TopLayerMask_TexelSize;
	UNITY_UNIFORM vec2                _FoilDisplacementTiling;
	UNITY_UNIFORM float Xhlslcc_UnusedX_VarnishRainbowDistortionStrength;
	UNITY_UNIFORM float                _RainbowStrength;
	UNITY_UNIFORM vec4 Xhlslcc_UnusedX_MainTex_TexelSize;
	UNITY_UNIFORM float Xhlslcc_UnusedX_Stencil;
	UNITY_UNIFORM float Xhlslcc_UnusedX_StencilOp;
	UNITY_UNIFORM float Xhlslcc_UnusedX_StencilWriteMask;
	UNITY_UNIFORM float Xhlslcc_UnusedX_StencilReadMask;
	UNITY_UNIFORM float Xhlslcc_UnusedX_ColorMask;
	UNITY_UNIFORM vec4 Xhlslcc_UnusedX_ClipRect;
	UNITY_UNIFORM float Xhlslcc_UnusedX_UIMaskSoftnessX;
	UNITY_UNIFORM float Xhlslcc_UnusedX_UIMaskSoftnessY;
#if HLSLCC_ENABLE_UNIFORM_BUFFERS
};
#endif
UNITY_LOCATION(0) uniform mediump sampler2D _SampleTexture2D_ecaa018932e843b68c4797464457ac07_Texture_1_Texture2D;
UNITY_LOCATION(1) uniform mediump sampler2D _SampleTexture2D_f44e690f3f3541a884ac95936014fc30_Texture_1_Texture2D;
UNITY_LOCATION(2) uniform mediump sampler2D _Texture2DAsset_450a32acbdb1461b842432479265bb3d_Out_0_Texture2D;
UNITY_LOCATION(3) uniform mediump sampler2D _Motif;
UNITY_LOCATION(4) uniform mediump sampler2D _MotifMask;
UNITY_LOCATION(5) uniform mediump sampler2D _RainbowGradientTex;
in highp  vec4 vs_INTERP0;
in highp  vec4 vs_INTERP2;
layout(location = 0) out mediump vec4 SV_TARGET0;
vec4 u_xlat0;
mediump vec2 u_xlat16_0;
vec4 u_xlat1;
mediump vec3 u_xlat16_1;
vec3 u_xlat2;
mediump vec3 u_xlat16_2;
vec3 u_xlat3;
mediump vec3 u_xlat16_3;
vec3 u_xlat4;
float u_xlat5;
vec3 u_xlat6;
vec3 u_xlat7;
vec2 u_xlat14;
float u_xlat21;
void main()
{
    u_xlat0.x = _DeviceRotationDegrees * 0.0174532924;
    u_xlat1.x = cos(u_xlat0.x);
    u_xlat0.x = sin(u_xlat0.x);
    u_xlat2.x = (-u_xlat0.x);
    u_xlat2.y = u_xlat1.x;
    u_xlat2.z = u_xlat0.x;
    u_xlat0.xy = vs_INTERP0.xy + vec2(-0.5, -0.5);
    u_xlat1.y = dot(u_xlat0.xy, u_xlat2.xy);
    u_xlat1.x = dot(u_xlat0.xy, u_xlat2.yz);
    u_xlat14.xy = u_xlat1.xy + vec2(0.5, 0.5);
    u_xlat1.xy = vs_INTERP0.xy * _FoilDisplacementTiling.xy;
    u_xlat16_1.xyz = texture(_SampleTexture2D_f44e690f3f3541a884ac95936014fc30_Texture_1_Texture2D, u_xlat1.xy).xyz;
    u_xlat2.y = u_xlat16_1.x * _FoilDisplacementStrength;
    u_xlat3.x = _Tilt.y + _Tilt.x;
    u_xlat2.x = u_xlat16_1.x * _FoilDisplacementStrength + u_xlat3.x;
    u_xlat2.xy = u_xlat2.xy + vec2(0.5, 0.300000012);
    u_xlat2.xy = u_xlat2.xy + (-vec2(_FoilDisplacementStrength));
    u_xlat14.xy = u_xlat14.xy * vec2(0.5, 1.0) + u_xlat2.xy;
    u_xlat16_2.xyz = texture(_RainbowGradientTex, u_xlat14.xy).xyz;
    u_xlat14.x = _DeviceRotationDegrees + 70.0;
    u_xlat14.x = u_xlat14.x * 0.0174532924;
    u_xlat4.x = sin(u_xlat14.x);
    u_xlat5 = cos(u_xlat14.x);
    u_xlat6.x = (-u_xlat4.x);
    u_xlat6.y = u_xlat5;
    u_xlat6.z = u_xlat4.x;
    u_xlat4.x = dot(u_xlat0.xy, u_xlat6.yz);
    u_xlat4.y = dot(u_xlat0.xy, u_xlat6.xy);
    u_xlat0.xy = u_xlat4.xy + vec2(0.5, 0.5);
    u_xlat3.y = 0.300000012;
    u_xlat0.xy = u_xlat0.xy * vec2(0.330000013, 0.330000013) + u_xlat3.xy;
    u_xlat16_0.xy = texture(_SampleTexture2D_ecaa018932e843b68c4797464457ac07_Texture_1_Texture2D, u_xlat0.xy).xy;
    u_xlat14.x = (-u_xlat16_0.x) + 1.0;
    u_xlat2.xyz = u_xlat16_2.xyz * abs(u_xlat14.xxx);
    u_xlat3.xyz = u_xlat16_0.xxx * vec3(0.600000024, 0.548571527, 0.449999988);
    u_xlat1.xyz = u_xlat16_1.xyz * vec3(0.300000012, 0.274285764, 0.224999994) + u_xlat3.xyz;
    u_xlat3.xyz = u_xlat1.xyz * u_xlat1.xyz;
    u_xlat1.xyz = u_xlat1.xyz * u_xlat3.xyz;
    u_xlat16_3.xyz = texture(_Motif, vs_INTERP0.xy).xyz;
    u_xlat14.x = dot(u_xlat16_3.xyz, vec3(0.212672904, 0.715152204, 0.0721750036));
    u_xlat14.x = (-u_xlat14.x) + 1.0;
    u_xlat21 = abs(u_xlat14.x) * u_xlat16_0.x;
    u_xlat0.x = (-u_xlat16_0.x) * abs(u_xlat14.x) + 1.0;
    u_xlat4.xyz = u_xlat16_0.yyy * vec3(0.125000015, 0.140441179, 0.150000006);
    u_xlat7.xyz = vec3(u_xlat21) * u_xlat16_3.xyz;
    u_xlat7.xyz = u_xlat7.xyz * vec3(1.32999992, 1.35294116, 1.37647057);
    u_xlat7.xyz = u_xlat16_3.xyz * vec3(0.469999999, 0.447058797, 0.423529387) + u_xlat7.xyz;
    u_xlat0.xyz = u_xlat1.xyz * abs(u_xlat0.xxx) + u_xlat7.xyz;
    u_xlat0.xyz = u_xlat2.xyz * vec3(vec3(_RainbowStrength, _RainbowStrength, _RainbowStrength)) + u_xlat0.xyz;
    u_xlat16_1.xyz = texture(_MotifMask, vs_INTERP0.xy).xyz;
    u_xlat2.xyz = (-u_xlat16_1.xyz) + vec3(1.0, 1.0, 1.0);
    u_xlat2.xyz = abs(u_xlat2.xyz) * u_xlat16_3.xyz;
    u_xlat0.xyz = u_xlat0.xyz * u_xlat16_1.xyz + u_xlat2.xyz;
    u_xlat16_1.xy = texture(_Texture2DAsset_450a32acbdb1461b842432479265bb3d_Out_0_Texture2D, vs_INTERP0.xy).xy;
    u_xlat0.xyz = u_xlat4.xyz * u_xlat16_1.xxx + u_xlat0.xyz;
    u_xlat1.x = vs_INTERP2.w * 255.0;
    u_xlat1.x = roundEven(u_xlat1.x);
    u_xlat1.w = u_xlat16_1.y * u_xlat1.x;
    u_xlat0.w = 0.00392156886;
    u_xlat1.xyz = vs_INTERP2.xyz;
    u_xlat0 = u_xlat0 * u_xlat1;
    SV_TARGET0.xyz = u_xlat0.www * u_xlat0.xyz;
    SV_TARGET0.w = u_xlat0.w;
    return;
}

