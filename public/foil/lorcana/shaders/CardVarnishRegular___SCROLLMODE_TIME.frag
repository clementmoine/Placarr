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
	UNITY_UNIFORM vec4 Xhlslcc_UnusedX_CalculateVarnishLayers_73ebb6f60a5648fead4edb0e1b742729_DistortionTex_3454849507_Texture2D_TexelSize;
	UNITY_UNIFORM vec4 Xhlslcc_UnusedX_CalculateVarnishLayers_73ebb6f60a5648fead4edb0e1b742729_VarnishShineTex_1105464448_Texture2D_TexelSize;
	UNITY_UNIFORM vec4 Xhlslcc_UnusedX_SampleTexture2D_42722767dabc4cb3a6c6f6e3f8ef5ea8_Texture_1_Texture2D_TexelSize;
	UNITY_UNIFORM vec4 Xhlslcc_UnusedX_SampleTexture2D_b03a50bb7ac04e9fa053b072bb1c81bf_Texture_1_Texture2D_TexelSize;
	UNITY_UNIFORM vec4 Xhlslcc_UnusedX_Motif_TexelSize;
	UNITY_UNIFORM float                _TimeFactor;
	UNITY_UNIFORM float                _DeviceRotationDegrees;
	UNITY_UNIFORM vec4 Xhlslcc_UnusedX_TopLayerMask_TexelSize;
	UNITY_UNIFORM float                _VarnishDarkenStrength;
	UNITY_UNIFORM float                _VarnishBevelStrength;
	UNITY_UNIFORM float                _VarnishHighlightStrength;
	UNITY_UNIFORM vec4                _LightColor;
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
UNITY_LOCATION(0) uniform mediump sampler2D _CalculateVarnishLayers_73ebb6f60a5648fead4edb0e1b742729_DistortionTex_3454849507_Texture2D;
UNITY_LOCATION(1) uniform mediump sampler2D _CalculateVarnishLayers_73ebb6f60a5648fead4edb0e1b742729_VarnishShineTex_1105464448_Texture2D;
UNITY_LOCATION(2) uniform mediump sampler2D _SampleTexture2D_42722767dabc4cb3a6c6f6e3f8ef5ea8_Texture_1_Texture2D;
UNITY_LOCATION(3) uniform mediump sampler2D _SampleTexture2D_b03a50bb7ac04e9fa053b072bb1c81bf_Texture_1_Texture2D;
UNITY_LOCATION(4) uniform mediump sampler2D _Motif;
UNITY_LOCATION(5) uniform mediump sampler2D _TopLayerMask;
in highp  vec4 vs_INTERP0;
in highp  vec4 vs_INTERP2;
layout(location = 0) out mediump vec4 SV_TARGET0;
vec4 u_xlat0;
mediump vec2 u_xlat16_0;
vec4 u_xlat1;
mediump float u_xlat16_1;
vec3 u_xlat2;
mediump vec3 u_xlat16_2;
vec3 u_xlat3;
vec3 u_xlat4;
mediump vec3 u_xlat16_6;
vec2 u_xlat7;
vec2 u_xlat10;
mediump vec2 u_xlat16_10;
vec2 u_xlat12;
float u_xlat15;
void main()
{
    u_xlat0.xy = vs_INTERP0.xy + vec2(-1.0, -0.0);
    u_xlat10.x = _DeviceRotationDegrees + 70.0;
    u_xlat10.x = u_xlat10.x * 0.0174532924;
    u_xlat1.x = sin(u_xlat10.x);
    u_xlat2.x = cos(u_xlat10.x);
    u_xlat3.x = (-u_xlat1.x);
    u_xlat3.y = u_xlat2.x;
    u_xlat4.y = dot(u_xlat0.xy, u_xlat3.xy);
    u_xlat3.z = u_xlat1.x;
    u_xlat4.x = dot(u_xlat0.xy, u_xlat3.yz);
    u_xlat0.xy = u_xlat4.xy + vec2(1.0, 0.0);
    u_xlat10.xy = vs_INTERP0.xy * vec2(0.25, 0.5);
    u_xlat16_10.xy = texture(_CalculateVarnishLayers_73ebb6f60a5648fead4edb0e1b742729_DistortionTex_3454849507_Texture2D, u_xlat10.xy).xy;
    u_xlat10.xy = u_xlat16_10.xy + vec2(-0.217637643, -0.217637643);
    u_xlat16_6.xyz = texture(_TopLayerMask, vs_INTERP0.xy).xyz;
    u_xlat7.xy = u_xlat16_6.yx * vec2(2.0, 2.0) + vec2(-1.0, -1.0);
    u_xlat3.xy = u_xlat1.xx * u_xlat7.xy;
    u_xlat4.x = u_xlat7.y * u_xlat2.x + (-u_xlat3.x);
    u_xlat4.y = u_xlat7.x * u_xlat2.x + u_xlat3.y;
    u_xlat2.x = _CosTime.w * _TimeFactor;
    u_xlat2.y = 0.300000012;
    u_xlat12.xy = vec2(vec2(_VarnishBevelStrength, _VarnishBevelStrength)) * u_xlat4.xy + u_xlat2.xy;
    u_xlat2.xy = u_xlat0.xy * vec2(0.400000006, 0.400000006) + u_xlat2.xy;
    u_xlat16_1 = texture(_SampleTexture2D_b03a50bb7ac04e9fa053b072bb1c81bf_Texture_1_Texture2D, u_xlat2.xy).x;
    u_xlat10.xy = u_xlat10.xy * vec2(0.0399999991, 0.0399999991) + u_xlat12.xy;
    u_xlat10.xy = u_xlat10.xy + vec2(-0.0823623687, -0.0823623687);
    u_xlat0.xy = u_xlat0.xy * vec2(0.400000006, 0.400000006) + u_xlat10.xy;
    u_xlat16_0.xy = texture(_CalculateVarnishLayers_73ebb6f60a5648fead4edb0e1b742729_VarnishShineTex_1105464448_Texture2D, u_xlat0.xy).xy;
    u_xlat16_2.xyz = texture(_Motif, vs_INTERP0.xy).xyz;
    u_xlat3.xyz = u_xlat16_0.yyy * u_xlat16_2.xyz;
    u_xlat10.x = dot(u_xlat3.xyz, vec3(0.212672904, 0.715152204, 0.0721750036));
    u_xlat3.xyz = u_xlat16_2.xyz * u_xlat16_0.yyy + (-u_xlat10.xxx);
    u_xlat3.xyz = u_xlat3.xyz * vec3(1.39999998, 1.39999998, 1.39999998) + u_xlat10.xxx;
    u_xlat10.x = (-u_xlat16_0.y) + 1.0;
    u_xlat3.xyz = u_xlat16_2.xyz * u_xlat10.xxx + u_xlat3.xyz;
    u_xlat10.x = (-u_xlat16_6.z) + 1.0;
    u_xlat15 = u_xlat16_1 * abs(u_xlat10.x);
    u_xlat10.x = -abs(u_xlat10.x) * u_xlat16_1 + 1.0;
    u_xlat4.xyz = u_xlat16_2.xyz * vec3(u_xlat15);
    u_xlat1.x = dot(u_xlat4.xyz, vec3(0.212672904, 0.715152204, 0.0721750036));
    u_xlat2.xyz = vec3(u_xlat15) * u_xlat16_2.xyz + (-u_xlat1.xxx);
    u_xlat2.xyz = u_xlat2.xyz * vec3(0.75, 0.75, 0.75) + u_xlat1.xxx;
    u_xlat2.xyz = u_xlat10.xxx * u_xlat3.xyz + u_xlat2.xyz;
    u_xlat10.x = u_xlat16_6.z * _VarnishDarkenStrength;
    u_xlat10.x = u_xlat16_0.y * u_xlat10.x;
    u_xlat3.xyz = (-u_xlat10.xxx) * _LightColor.xyz + vec3(1.0, 1.0, 1.0);
    u_xlat2.xyz = u_xlat2.xyz * abs(u_xlat3.xyz);
    u_xlat10.x = dot(u_xlat2.xyz, vec3(0.212672904, 0.715152204, 0.0721750036));
    u_xlat10.x = (-u_xlat10.x) * 0.25 + 1.0;
    u_xlat3.z = 2.0;
    u_xlat3.xy = u_xlat16_6.xy + u_xlat16_6.xy;
    u_xlat1.xyz = u_xlat3.xyz / vec3(1.0, 1.0, 1.0);
    u_xlat1.xyz = u_xlat1.xyz + vec3(-1.0, -1.0, -1.0);
    u_xlat15 = dot(u_xlat1.xyz, vec3(1.0, 1.0, 0.5));
    u_xlat1.x = dot(u_xlat1.xyz, vec3(-1.0, -1.0, 0.5));
    u_xlat1.x = u_xlat1.x + -0.5;
    u_xlat1.x = clamp(u_xlat1.x, 0.0, 1.0);
    u_xlat15 = u_xlat15 + -0.5;
    u_xlat15 = clamp(u_xlat15, 0.0, 1.0);
    u_xlat15 = u_xlat1.x + u_xlat15;
    u_xlat15 = u_xlat15 * 0.800000012;
    u_xlat1.xyz = vec3(u_xlat15) * _LightColor.xyz;
    u_xlat1.xyz = u_xlat16_6.zzz * u_xlat1.xyz;
    u_xlat0.x = u_xlat16_0.x * u_xlat16_6.z;
    u_xlat1.xyz = u_xlat16_0.yyy * u_xlat1.xyz;
    u_xlat0.xyw = u_xlat0.xxx * _LightColor.xyz;
    u_xlat0.xyw = vec3(vec3(_VarnishHighlightStrength, _VarnishHighlightStrength, _VarnishHighlightStrength)) * u_xlat0.xyw + u_xlat1.xyz;
    u_xlat0.xyz = u_xlat0.xyw * u_xlat10.xxx + u_xlat2.xyz;
    u_xlat1.x = vs_INTERP2.w * 255.0;
    u_xlat1.x = roundEven(u_xlat1.x);
    u_xlat16_6.x = texture(_SampleTexture2D_42722767dabc4cb3a6c6f6e3f8ef5ea8_Texture_1_Texture2D, vs_INTERP0.xy).y;
    u_xlat1.w = u_xlat16_6.x * u_xlat1.x;
    u_xlat0.w = 0.00392156886;
    u_xlat1.xyz = vs_INTERP2.xyz;
    u_xlat0 = u_xlat0 * u_xlat1;
    SV_TARGET0.xyz = u_xlat0.www * u_xlat0.xyz;
    SV_TARGET0.w = u_xlat0.w;
    return;
}

