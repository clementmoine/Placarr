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
	UNITY_UNIFORM vec4 Xhlslcc_UnusedX_SampleTexture2D_ec9b044a8f854b959842da02b1cd8abd_Texture_1_Texture2D_TexelSize;
	UNITY_UNIFORM vec4 Xhlslcc_UnusedX_SampleTexture2D_ecaa018932e843b68c4797464457ac07_Texture_1_Texture2D_TexelSize;
	UNITY_UNIFORM vec4 Xhlslcc_UnusedX_Motif_TexelSize;
	UNITY_UNIFORM float                _TimeFactor;
	UNITY_UNIFORM vec4 Xhlslcc_UnusedX_MotifMask_TexelSize;
	UNITY_UNIFORM float                _DeviceRotationDegrees;
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
UNITY_LOCATION(0) uniform mediump sampler2D _SampleTexture2D_ec9b044a8f854b959842da02b1cd8abd_Texture_1_Texture2D;
UNITY_LOCATION(1) uniform mediump sampler2D _SampleTexture2D_ecaa018932e843b68c4797464457ac07_Texture_1_Texture2D;
UNITY_LOCATION(2) uniform mediump sampler2D _Motif;
UNITY_LOCATION(3) uniform mediump sampler2D _MotifMask;
in highp  vec4 vs_INTERP0;
in highp  vec4 vs_INTERP2;
layout(location = 0) out mediump vec4 SV_TARGET0;
vec4 u_xlat0;
vec4 u_xlat1;
mediump vec3 u_xlat16_1;
vec4 u_xlat2;
mediump vec3 u_xlat16_2;
vec4 u_xlat3;
vec3 u_xlat4;
vec3 u_xlat5;
mediump vec2 u_xlat16_5;
float u_xlat6;
bool u_xlatb6;
vec2 u_xlat7;
vec2 u_xlat10;
vec2 u_xlat11;
bool u_xlatb11;
bool u_xlatb12;
float u_xlat15;
bool u_xlatb15;
float u_xlat16;
bool u_xlatb16;
bool u_xlatb17;
void main()
{
    u_xlat0 = vs_INTERP0.xyxy * vec4(2000.0, 2000.0, 1000.0, 1000.0);
    u_xlat1 = floor(u_xlat0);
    u_xlat0 = fract(u_xlat0);
    u_xlat2 = u_xlat1.zwzw + vec4(0.0, 1.0, 1.0, 1.0);
    u_xlat2.z = dot(u_xlat2.zw, vec2(12.9898005, 78.2330017));
    u_xlat2.x = dot(u_xlat2.xy, vec2(12.9898005, 78.2330017));
    u_xlat2.xy = u_xlat2.xz * vec2(0.159154937, 0.159154937);
    u_xlatb12 = u_xlat2.y>=(-u_xlat2.y);
    u_xlat7.x = fract(abs(u_xlat2.y));
    u_xlat7.x = (u_xlatb12) ? u_xlat7.x : (-u_xlat7.x);
    u_xlat7.x = u_xlat7.x * 6.28318548;
    u_xlat7.x = sin(u_xlat7.x);
    u_xlat2.y = u_xlat7.x * 43758.5469;
    u_xlatb12 = u_xlat2.x>=(-u_xlat2.x);
    u_xlat2.x = fract(abs(u_xlat2.x));
    u_xlat2.x = (u_xlatb12) ? u_xlat2.x : (-u_xlat2.x);
    u_xlat2.x = u_xlat2.x * 6.28318548;
    u_xlat2.x = sin(u_xlat2.x);
    u_xlat2.x = u_xlat2.x * 43758.5469;
    u_xlat2.xy = fract(u_xlat2.xy);
    u_xlat7.x = (-u_xlat2.x) + u_xlat2.y;
    u_xlat3 = u_xlat0 * u_xlat0;
    u_xlat0 = (-u_xlat0) * vec4(2.0, 2.0, 2.0, 2.0) + vec4(3.0, 3.0, 3.0, 3.0);
    u_xlat0 = u_xlat0 * u_xlat3;
    u_xlat2.x = u_xlat0.z * u_xlat7.x + u_xlat2.x;
    u_xlat3 = u_xlat1 + vec4(1.0, 1.0, 1.0, 0.0);
    u_xlat7.x = dot(u_xlat3.zw, vec2(12.9898005, 78.2330017));
    u_xlat7.y = dot(u_xlat3.xy, vec2(12.9898005, 78.2330017));
    u_xlat7.xy = u_xlat7.xy * vec2(0.159154937, 0.159154937);
    u_xlatb17 = u_xlat7.x>=(-u_xlat7.x);
    u_xlat7.x = fract(abs(u_xlat7.x));
    u_xlat7.x = (u_xlatb17) ? u_xlat7.x : (-u_xlat7.x);
    u_xlat7.x = u_xlat7.x * 6.28318548;
    u_xlat7.x = sin(u_xlat7.x);
    u_xlat7.x = u_xlat7.x * 43758.5469;
    u_xlat7.x = fract(u_xlat7.x);
    u_xlat11.x = dot(u_xlat1.zw, vec2(12.9898005, 78.2330017));
    u_xlat11.x = u_xlat11.x * 0.159154937;
    u_xlatb16 = u_xlat11.x>=(-u_xlat11.x);
    u_xlat11.x = fract(abs(u_xlat11.x));
    u_xlat11.x = (u_xlatb16) ? u_xlat11.x : (-u_xlat11.x);
    u_xlat11.x = u_xlat11.x * 6.28318548;
    u_xlat11.x = sin(u_xlat11.x);
    u_xlat11.x = u_xlat11.x * 43758.5469;
    u_xlat11.x = fract(u_xlat11.x);
    u_xlat16 = (-u_xlat11.x) + u_xlat7.x;
    u_xlat10.x = u_xlat0.z * u_xlat16 + u_xlat11.x;
    u_xlat11.x = (-u_xlat10.x) + u_xlat2.x;
    u_xlat10.x = u_xlat0.w * u_xlat11.x + u_xlat10.x;
    u_xlatb15 = u_xlat7.y>=(-u_xlat7.y);
    u_xlat11.x = fract(abs(u_xlat7.y));
    u_xlat10.y = (u_xlatb15) ? u_xlat11.x : (-u_xlat11.x);
    u_xlat10.xy = u_xlat10.xy * vec2(0.25, 6.28318548);
    u_xlat15 = sin(u_xlat10.y);
    u_xlat15 = u_xlat15 * 43758.5469;
    u_xlat15 = fract(u_xlat15);
    u_xlat2 = u_xlat1.xyxy + vec4(1.0, 0.0, 0.0, 1.0);
    u_xlat1.x = dot(u_xlat1.xy, vec2(12.9898005, 78.2330017));
    u_xlat1.y = dot(u_xlat2.zw, vec2(12.9898005, 78.2330017));
    u_xlat1.z = dot(u_xlat2.xy, vec2(12.9898005, 78.2330017));
    u_xlat1.xyz = u_xlat1.xyz * vec3(0.159154937, 0.159154937, 0.159154937);
    u_xlatb16 = u_xlat1.y>=(-u_xlat1.y);
    u_xlat6 = fract(abs(u_xlat1.y));
    u_xlat6 = (u_xlatb16) ? u_xlat6 : (-u_xlat6);
    u_xlat6 = u_xlat6 * 6.28318548;
    u_xlat6 = sin(u_xlat6);
    u_xlat6 = u_xlat6 * 43758.5469;
    u_xlat6 = fract(u_xlat6);
    u_xlat15 = u_xlat15 + (-u_xlat6);
    u_xlat15 = u_xlat0.x * u_xlat15 + u_xlat6;
    u_xlatb6 = u_xlat1.z>=(-u_xlat1.z);
    u_xlat11.x = fract(abs(u_xlat1.z));
    u_xlat6 = (u_xlatb6) ? u_xlat11.x : (-u_xlat11.x);
    u_xlat6 = u_xlat6 * 6.28318548;
    u_xlat6 = sin(u_xlat6);
    u_xlat1.y = u_xlat6 * 43758.5469;
    u_xlatb11 = u_xlat1.x>=(-u_xlat1.x);
    u_xlat1.x = fract(abs(u_xlat1.x));
    u_xlat1.x = (u_xlatb11) ? u_xlat1.x : (-u_xlat1.x);
    u_xlat1.x = u_xlat1.x * 6.28318548;
    u_xlat1.x = sin(u_xlat1.x);
    u_xlat1.x = u_xlat1.x * 43758.5469;
    u_xlat1.xy = fract(u_xlat1.xy);
    u_xlat6 = (-u_xlat1.x) + u_xlat1.y;
    u_xlat0.x = u_xlat0.x * u_xlat6 + u_xlat1.x;
    u_xlat15 = (-u_xlat0.x) + u_xlat15;
    u_xlat0.x = u_xlat0.y * u_xlat15 + u_xlat0.x;
    u_xlat0.x = u_xlat0.x * 0.125 + u_xlat10.x;
    u_xlat5.xy = vs_INTERP0.xy * vec2(500.0, 500.0);
    u_xlat1.xy = floor(u_xlat5.xy);
    u_xlat11.xy = u_xlat1.xy + vec2(1.0, 1.0);
    u_xlat15 = dot(u_xlat11.xy, vec2(12.9898005, 78.2330017));
    u_xlat15 = u_xlat15 * 0.159154937;
    u_xlatb11 = u_xlat15>=(-u_xlat15);
    u_xlat15 = fract(abs(u_xlat15));
    u_xlat15 = (u_xlatb11) ? u_xlat15 : (-u_xlat15);
    u_xlat15 = u_xlat15 * 6.28318548;
    u_xlat15 = sin(u_xlat15);
    u_xlat5.z = u_xlat15 * 43758.5469;
    u_xlat5.xyz = fract(u_xlat5.xyz);
    u_xlat2 = u_xlat1.xyxy + vec4(1.0, 0.0, 0.0, 1.0);
    u_xlat1.x = dot(u_xlat1.xy, vec2(12.9898005, 78.2330017));
    u_xlat1.y = dot(u_xlat2.zw, vec2(12.9898005, 78.2330017));
    u_xlat1.z = dot(u_xlat2.xy, vec2(12.9898005, 78.2330017));
    u_xlat1.xyz = u_xlat1.xyz * vec3(0.159154937, 0.159154937, 0.159154937);
    u_xlatb16 = u_xlat1.y>=(-u_xlat1.y);
    u_xlat6 = fract(abs(u_xlat1.y));
    u_xlat6 = (u_xlatb16) ? u_xlat6 : (-u_xlat6);
    u_xlat6 = u_xlat6 * 6.28318548;
    u_xlat6 = sin(u_xlat6);
    u_xlat6 = u_xlat6 * 43758.5469;
    u_xlat6 = fract(u_xlat6);
    u_xlat15 = u_xlat5.z + (-u_xlat6);
    u_xlat2.xy = u_xlat5.xy * u_xlat5.xy;
    u_xlat5.xy = (-u_xlat5.xy) * vec2(2.0, 2.0) + vec2(3.0, 3.0);
    u_xlat5.xy = u_xlat5.xy * u_xlat2.xy;
    u_xlat15 = u_xlat5.x * u_xlat15 + u_xlat6;
    u_xlatb6 = u_xlat1.z>=(-u_xlat1.z);
    u_xlat11.x = fract(abs(u_xlat1.z));
    u_xlat6 = (u_xlatb6) ? u_xlat11.x : (-u_xlat11.x);
    u_xlat6 = u_xlat6 * 6.28318548;
    u_xlat6 = sin(u_xlat6);
    u_xlat1.y = u_xlat6 * 43758.5469;
    u_xlatb11 = u_xlat1.x>=(-u_xlat1.x);
    u_xlat1.x = fract(abs(u_xlat1.x));
    u_xlat1.x = (u_xlatb11) ? u_xlat1.x : (-u_xlat1.x);
    u_xlat1.x = u_xlat1.x * 6.28318548;
    u_xlat1.x = sin(u_xlat1.x);
    u_xlat1.x = u_xlat1.x * 43758.5469;
    u_xlat1.xy = fract(u_xlat1.xy);
    u_xlat6 = (-u_xlat1.x) + u_xlat1.y;
    u_xlat5.x = u_xlat5.x * u_xlat6 + u_xlat1.x;
    u_xlat15 = (-u_xlat5.x) + u_xlat15;
    u_xlat5.x = u_xlat5.y * u_xlat15 + u_xlat5.x;
    u_xlat0.x = u_xlat5.x * 0.5 + u_xlat0.x;
    u_xlat5.x = _DeviceRotationDegrees + 70.0;
    u_xlat5.x = u_xlat5.x * 0.0174532924;
    u_xlat1.x = sin(u_xlat5.x);
    u_xlat2.x = cos(u_xlat5.x);
    u_xlat3.x = (-u_xlat1.x);
    u_xlat3.y = u_xlat2.x;
    u_xlat3.z = u_xlat1.x;
    u_xlat5.xy = vs_INTERP0.xy + vec2(-0.5, -0.5);
    u_xlat1.y = dot(u_xlat5.xy, u_xlat3.xy);
    u_xlat1.x = dot(u_xlat5.xy, u_xlat3.yz);
    u_xlat5.xy = u_xlat1.xy + vec2(0.5, 0.5);
    u_xlat1.x = _TimeFactor * _CosTime.w + 0.219999999;
    u_xlat1.y = 0.300000012;
    u_xlat5.xy = u_xlat5.xy * vec2(0.400000006, 0.400000006) + u_xlat1.xy;
    u_xlat16_5.xy = texture(_SampleTexture2D_ecaa018932e843b68c4797464457ac07_Texture_1_Texture2D, u_xlat5.xy).xy;
    u_xlat1.xyz = u_xlat16_5.xxx * vec3(0.600000024, 0.548571527, 0.449999988);
    u_xlat1.xyz = u_xlat0.xxx * vec3(0.300000012, 0.274285764, 0.224999994) + u_xlat1.xyz;
    u_xlat2.xyz = u_xlat1.xyz * u_xlat1.xyz;
    u_xlat1.xyz = u_xlat1.xyz * u_xlat2.xyz;
    u_xlat1.xyz = u_xlat1.xyz * vec3(1.70000005, 1.70000005, 1.70000005);
    u_xlat16_2.xyz = texture(_Motif, vs_INTERP0.xy).xyz;
    u_xlat0.x = dot(u_xlat16_2.xyz, vec3(0.212672904, 0.715152204, 0.0721750036));
    u_xlat0.x = (-u_xlat0.x) + 1.0;
    u_xlat15 = abs(u_xlat0.x) * u_xlat16_5.x;
    u_xlat0.x = (-u_xlat16_5.x) * abs(u_xlat0.x) + 1.0;
    u_xlat3.xyz = u_xlat16_5.yyy * vec3(0.125000015, 0.140441179, 0.150000006);
    u_xlat5.xyz = vec3(u_xlat15) * u_xlat16_2.xyz;
    u_xlat5.xyz = u_xlat5.xyz * vec3(1.52941179, 1.5529412, 1.57647061);
    u_xlat5.xyz = u_xlat16_2.xyz * vec3(0.470588207, 0.447058797, 0.423529387) + u_xlat5.xyz;
    u_xlat0.xyz = u_xlat1.xyz * abs(u_xlat0.xxx) + u_xlat5.xyz;
    u_xlat16_1.xyz = texture(_MotifMask, vs_INTERP0.xy).xyz;
    u_xlat4.xyz = (-u_xlat16_1.xyz) + vec3(1.0, 1.0, 1.0);
    u_xlat2.xyz = u_xlat16_2.xyz * abs(u_xlat4.xyz);
    u_xlat0.xyz = u_xlat0.xyz * u_xlat16_1.xyz + u_xlat2.xyz;
    u_xlat16_1.xy = texture(_SampleTexture2D_ec9b044a8f854b959842da02b1cd8abd_Texture_1_Texture2D, vs_INTERP0.xy).xy;
    u_xlat0.xyz = u_xlat3.xyz * u_xlat16_1.xxx + u_xlat0.xyz;
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

