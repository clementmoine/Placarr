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
UNITY_BINDING(0) uniform UnityPerCamera {
#endif
	UNITY_UNIFORM vec4 Xhlslcc_UnusedX_Time;
	UNITY_UNIFORM vec4 Xhlslcc_UnusedX_SinTime;
	UNITY_UNIFORM vec4                _CosTime;
	UNITY_UNIFORM vec4 Xhlslcc_UnusedXunity_DeltaTime;
	UNITY_UNIFORM vec3 Xhlslcc_UnusedX_WorldSpaceCameraPos;
	UNITY_UNIFORM vec4 Xhlslcc_UnusedX_ProjectionParams;
	UNITY_UNIFORM vec4 Xhlslcc_UnusedX_ScreenParams;
	UNITY_UNIFORM vec4 Xhlslcc_UnusedX_ZBufferParams;
	UNITY_UNIFORM vec4 Xhlslcc_UnusedXunity_OrthoParams;
#if HLSLCC_ENABLE_UNIFORM_BUFFERS
};
#endif
#if HLSLCC_ENABLE_UNIFORM_BUFFERS
UNITY_BINDING(1) uniform UnityPerMaterial {
#endif
	UNITY_UNIFORM vec4 Xhlslcc_UnusedX_CalculateVarnishLayers_32b038f47e684388a3378904b95b91d3_DistortionTex_3454849507_Texture2D_TexelSize;
	UNITY_UNIFORM vec4 Xhlslcc_UnusedX_SampleTexture2D_ecaa018932e843b68c4797464457ac07_Texture_1_Texture2D_TexelSize;
	UNITY_UNIFORM vec4 Xhlslcc_UnusedX_SampleTexture2D_f44e690f3f3541a884ac95936014fc30_Texture_1_Texture2D_TexelSize;
	UNITY_UNIFORM vec4 Xhlslcc_UnusedX_Texture2DAsset_450a32acbdb1461b842432479265bb3d_Out_0_Texture2D_TexelSize;
	UNITY_UNIFORM vec4 Xhlslcc_UnusedX_Motif_TexelSize;
	UNITY_UNIFORM float                _TimeFactor;
	UNITY_UNIFORM vec4 Xhlslcc_UnusedX_MotifMask_TexelSize;
	UNITY_UNIFORM vec2 Xhlslcc_UnusedX_Tilt;
	UNITY_UNIFORM float                _DeviceRotationDegrees;
	UNITY_UNIFORM vec4 Xhlslcc_UnusedX_RainbowGradientTex_TexelSize;
	UNITY_UNIFORM float                _FoilDisplacementStrength;
	UNITY_UNIFORM float                _VarnishHighlightStrength;
	UNITY_UNIFORM vec2                _VarnishDistortionTiling;
	UNITY_UNIFORM float                _VarnishDistortionStrength;
	UNITY_UNIFORM float                _VarnishBevelStrength;
	UNITY_UNIFORM vec4 Xhlslcc_UnusedX_VarnishShineTex_TexelSize;
	UNITY_UNIFORM vec4                _VarnishLightColor;
	UNITY_UNIFORM float                _VarnishOffset;
	UNITY_UNIFORM float                _VarnishOutlineStrength;
	UNITY_UNIFORM float                _VarnishDarkenStrength;
	UNITY_UNIFORM vec4 Xhlslcc_UnusedX_TopLayerMask_TexelSize;
	UNITY_UNIFORM vec2                _FoilDisplacementTiling;
	UNITY_UNIFORM float                _VarnishRainbowDistortionStrength;
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
UNITY_LOCATION(0) uniform mediump sampler2D _CalculateVarnishLayers_32b038f47e684388a3378904b95b91d3_DistortionTex_3454849507_Texture2D;
UNITY_LOCATION(1) uniform mediump sampler2D _SampleTexture2D_ecaa018932e843b68c4797464457ac07_Texture_1_Texture2D;
UNITY_LOCATION(2) uniform mediump sampler2D _SampleTexture2D_f44e690f3f3541a884ac95936014fc30_Texture_1_Texture2D;
UNITY_LOCATION(3) uniform mediump sampler2D _Texture2DAsset_450a32acbdb1461b842432479265bb3d_Out_0_Texture2D;
UNITY_LOCATION(4) uniform mediump sampler2D _Motif;
UNITY_LOCATION(5) uniform mediump sampler2D _MotifMask;
UNITY_LOCATION(6) uniform mediump sampler2D _RainbowGradientTex;
UNITY_LOCATION(7) uniform mediump sampler2D _VarnishShineTex;
UNITY_LOCATION(8) uniform mediump sampler2D _TopLayerMask;
in highp  vec4 vs_INTERP0;
in highp  vec4 vs_INTERP2;
layout(location = 0) out mediump vec4 SV_TARGET0;
vec4 u_xlat0;
mediump vec4 u_xlat16_0;
vec4 u_xlat1;
mediump float u_xlat16_1;
vec4 u_xlat2;
mediump vec3 u_xlat16_2;
vec3 u_xlat3;
mediump vec3 u_xlat16_3;
mediump vec3 u_xlat16_4;
vec3 u_xlat5;
vec3 u_xlat6;
vec3 u_xlat7;
mediump vec3 u_xlat16_7;
vec3 u_xlat8;
vec3 u_xlat9;
mediump vec2 u_xlat16_9;
vec3 u_xlat10;
float u_xlat11;
float u_xlat17;
vec2 u_xlat18;
vec2 u_xlat19;
float u_xlat26;
float u_xlat28;
void main()
{
    u_xlat0.x = _DeviceRotationDegrees + 70.0;
    u_xlat0.x = u_xlat0.x * 0.0174532924;
    u_xlat1.x = cos(u_xlat0.x);
    u_xlat0.x = sin(u_xlat0.x);
    u_xlat2.x = (-u_xlat0.x);
    u_xlat2.y = u_xlat1.x;
    u_xlat8.xy = vs_INTERP0.xy + vec2(-0.5, -0.5);
    u_xlat3.y = dot(u_xlat8.xy, u_xlat2.xy);
    u_xlat2.z = u_xlat0.x;
    u_xlat3.x = dot(u_xlat8.xy, u_xlat2.yz);
    u_xlat2 = u_xlat3.xyxy + vec4(0.5, 0.5, 0.5, 0.5);
    u_xlat9.xy = vs_INTERP0.xy * vec2(_VarnishDistortionTiling.x, _VarnishDistortionTiling.y);
    u_xlat16_9.xy = texture(_CalculateVarnishLayers_32b038f47e684388a3378904b95b91d3_DistortionTex_3454849507_Texture2D, u_xlat9.xy).xy;
    u_xlat9.xy = u_xlat16_9.xy + vec2(-0.217637643, -0.217637643);
    u_xlat9.xy = u_xlat9.xy * vec2(_VarnishDistortionStrength) + vec2(0.217637643, 0.217637643);
    u_xlat9.xy = u_xlat9.xy + (-vec2(_VarnishOffset));
    u_xlat3.x = _CosTime.w * _TimeFactor;
    u_xlat3.y = 0.300000012;
    u_xlat16_4.xyz = texture(_TopLayerMask, vs_INTERP0.xy).xyz;
    u_xlat19.xy = u_xlat16_4.xy * vec2(2.0, 2.0) + vec2(-1.0, -1.0);
    u_xlat0.xw = u_xlat0.xx * u_xlat19.yx;
    u_xlat5.x = u_xlat19.x * u_xlat1.x + (-u_xlat0.x);
    u_xlat5.y = u_xlat19.y * u_xlat1.x + u_xlat0.w;
    u_xlat0.xw = vec2(vec2(_VarnishBevelStrength, _VarnishBevelStrength)) * u_xlat5.xy + u_xlat3.xy;
    u_xlat1.xw = u_xlat2.xy * vec2(0.330000013, 0.330000013) + u_xlat3.xy;
    u_xlat16_1 = texture(_SampleTexture2D_ecaa018932e843b68c4797464457ac07_Texture_1_Texture2D, u_xlat1.xw).x;
    u_xlat0.xw = u_xlat9.xy + u_xlat0.xw;
    u_xlat0.xw = u_xlat2.zw * vec2(0.400000006, 0.400000006) + u_xlat0.xw;
    u_xlat16_0.xw = texture(_VarnishShineTex, u_xlat0.xw).xy;
    u_xlat9.x = (-u_xlat16_0.w) + 1.0;
    u_xlat16_2.xyz = texture(_Motif, vs_INTERP0.xy).xyz;
    u_xlat5.xyz = u_xlat16_0.www * u_xlat16_2.xyz;
    u_xlat17 = dot(u_xlat5.xyz, vec3(0.212672904, 0.715152204, 0.0721750036));
    u_xlat5.xyz = u_xlat16_2.xyz * u_xlat16_0.www + (-vec3(u_xlat17));
    u_xlat5.xyz = u_xlat5.xyz * vec3(1.39999998, 1.39999998, 1.39999998) + vec3(u_xlat17);
    u_xlat9.xyz = u_xlat16_2.xyz * u_xlat9.xxx + u_xlat5.xyz;
    u_xlat26 = (-u_xlat16_4.z) + 1.0;
    u_xlat3.x = u_xlat16_1 * abs(u_xlat26);
    u_xlat26 = -abs(u_xlat26) * u_xlat16_1 + 1.0;
    u_xlat5.xyz = u_xlat16_2.xyz * u_xlat3.xxx;
    u_xlat11 = dot(u_xlat5.xyz, vec3(0.212672904, 0.715152204, 0.0721750036));
    u_xlat5.xyz = u_xlat3.xxx * u_xlat16_2.xyz + (-vec3(u_xlat11));
    u_xlat5.xyz = u_xlat5.xyz * vec3(0.75, 0.75, 0.75) + vec3(u_xlat11);
    u_xlat9.xyz = vec3(u_xlat26) * u_xlat9.xyz + u_xlat5.xyz;
    u_xlat2.x = dot(u_xlat16_2.xyz, vec3(0.212672904, 0.715152204, 0.0721750036));
    u_xlat2.x = (-u_xlat2.x) * 0.25 + 1.0;
    u_xlat10.x = u_xlat16_4.z * _VarnishDarkenStrength;
    u_xlat10.x = u_xlat16_0.w * u_xlat10.x;
    u_xlat10.xyz = (-u_xlat10.xxx) * _VarnishLightColor.xyz + vec3(1.0, 1.0, 1.0);
    u_xlat9.xyz = u_xlat9.xyz * abs(u_xlat10.xyz);
    u_xlat10.x = dot(u_xlat9.xyz, vec3(0.212672904, 0.715152204, 0.0721750036));
    u_xlat10.x = (-u_xlat10.x) + 1.0;
    u_xlat18.x = u_xlat16_1 * abs(u_xlat10.x);
    u_xlat10.x = (-u_xlat16_1) * abs(u_xlat10.x) + 1.0;
    u_xlat5.xyz = u_xlat9.xyz * u_xlat18.xxx;
    u_xlat5.xyz = u_xlat5.xyz * vec3(1.32999992, 1.35294116, 1.37647057);
    u_xlat5.xyz = u_xlat9.xyz * vec3(0.469999999, 0.447058797, 0.423529387) + u_xlat5.xyz;
    u_xlat6.xyz = vec3(u_xlat16_1) * vec3(0.600000024, 0.548571527, 0.449999988);
    u_xlat1.x = (-u_xlat16_1) + 1.0;
    u_xlat18.xy = vs_INTERP0.xy * _FoilDisplacementTiling.xy;
    u_xlat16_7.xyz = texture(_SampleTexture2D_f44e690f3f3541a884ac95936014fc30_Texture_1_Texture2D, u_xlat18.xy).xyz;
    u_xlat6.xyz = u_xlat16_7.xyz * vec3(0.300000012, 0.274285764, 0.224999994) + u_xlat6.xyz;
    u_xlat3.y = u_xlat16_7.x * _FoilDisplacementStrength;
    u_xlat7.xyz = u_xlat6.xyz * u_xlat6.xyz;
    u_xlat6.xyz = u_xlat6.xyz * u_xlat7.xyz;
    u_xlat10.xyz = u_xlat6.xyz * abs(u_xlat10.xxx) + u_xlat5.xyz;
    u_xlat28 = _DeviceRotationDegrees * 0.0174532924;
    u_xlat5.x = sin(u_xlat28);
    u_xlat6.x = cos(u_xlat28);
    u_xlat7.x = (-u_xlat5.x);
    u_xlat7.y = u_xlat6.x;
    u_xlat7.z = u_xlat5.x;
    u_xlat5.x = dot(u_xlat8.xy, u_xlat7.yz);
    u_xlat5.y = dot(u_xlat8.xy, u_xlat7.xy);
    u_xlat8.xy = u_xlat5.xy + vec2(0.5, 0.5);
    u_xlat3.x = _TimeFactor * _CosTime.w + u_xlat3.y;
    u_xlat3.xy = u_xlat3.xy + vec2(0.5, 0.300000012);
    u_xlat3.xy = u_xlat3.xy + (-vec2(_FoilDisplacementStrength));
    u_xlat28 = u_xlat19.y * 0.939692616;
    u_xlat5.x = u_xlat19.x * 0.342020154 + (-u_xlat28);
    u_xlat5.y = dot(u_xlat19.xy, vec2(0.939692616, 0.342020154));
    u_xlat3.xy = u_xlat5.xy * vec2(vec2(_VarnishRainbowDistortionStrength, _VarnishRainbowDistortionStrength)) + u_xlat3.xy;
    u_xlat8.xy = u_xlat8.xy * vec2(0.5, 1.0) + u_xlat3.xy;
    u_xlat16_3.xyz = texture(_RainbowGradientTex, u_xlat8.xy).xyz;
    u_xlat3.xyz = abs(u_xlat1.xxx) * u_xlat16_3.xyz;
    u_xlat10.xyz = u_xlat3.xyz * vec3(vec3(_RainbowStrength, _RainbowStrength, _RainbowStrength)) + u_xlat10.xyz;
    u_xlat16_3.xyz = texture(_MotifMask, vs_INTERP0.xy).xyz;
    u_xlat5.xyz = (-u_xlat16_3.xyz) + vec3(1.0, 1.0, 1.0);
    u_xlat1.xyz = u_xlat9.xyz * abs(u_xlat5.xyz);
    u_xlat1.xyz = u_xlat10.xyz * u_xlat16_3.xyz + u_xlat1.xyz;
    u_xlat3.z = 2.0;
    u_xlat3.xy = u_xlat16_4.xy + u_xlat16_4.xy;
    u_xlat10.xyz = u_xlat3.xyz / vec3(1.0, 1.0, 1.0);
    u_xlat10.xyz = u_xlat10.xyz + vec3(-1.0, -1.0, -1.0);
    u_xlat8.x = dot(u_xlat10.xyz, vec3(1.0, 1.0, 0.5));
    u_xlat8.y = dot(u_xlat10.xyz, vec3(-1.0, -1.0, 0.5));
    u_xlat8.xy = u_xlat8.xy + vec2(-0.5, -0.5);
    u_xlat8.xy = clamp(u_xlat8.xy, 0.0, 1.0);
    u_xlat8.x = u_xlat8.y + u_xlat8.x;
    u_xlat8.x = u_xlat8.x * _VarnishOutlineStrength;
    u_xlat10.xyz = u_xlat8.xxx * _VarnishLightColor.xyz;
    u_xlat10.xyz = u_xlat16_4.zzz * u_xlat10.xyz;
    u_xlat0.x = u_xlat16_0.x * u_xlat16_4.z;
    u_xlat8.xyz = u_xlat16_0.www * u_xlat10.xyz;
    u_xlat10.xyz = u_xlat0.xxx * _VarnishLightColor.xyz;
    u_xlat0.xyz = vec3(vec3(_VarnishHighlightStrength, _VarnishHighlightStrength, _VarnishHighlightStrength)) * u_xlat10.xyz + u_xlat8.xyz;
    u_xlat0.xyz = u_xlat0.xyz * u_xlat2.xxx + u_xlat1.xyz;
    u_xlat1.x = vs_INTERP2.w * 255.0;
    u_xlat1.x = roundEven(u_xlat1.x);
    u_xlat16_9.x = texture(_Texture2DAsset_450a32acbdb1461b842432479265bb3d_Out_0_Texture2D, vs_INTERP0.xy).y;
    u_xlat1.w = u_xlat16_9.x * u_xlat1.x;
    u_xlat0.w = 0.00392156886;
    u_xlat1.xyz = vs_INTERP2.xyz;
    u_xlat0 = u_xlat0 * u_xlat1;
    SV_TARGET0.xyz = u_xlat0.www * u_xlat0.xyz;
    SV_TARGET0.w = u_xlat0.w;
    return;
}

