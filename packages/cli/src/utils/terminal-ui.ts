// ─── Whizan Cloud CLI — Terminal UI Utilities ────────────────────────────────

export const colors = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  italic: "\x1b[3m",
  underline: "\x1b[4m",

  // Core brand palette
  whizanCyan: "\x1b[38;2;0;210;255m",
  whizanPurple: "\x1b[38;2;139;92;246m",
  whizanBlue: "\x1b[38;2;59;130;246m",

  // Semantic
  emerald: "\x1b[38;2;16;185;129m",
  amber: "\x1b[38;2;245;158;11m",
  red: "\x1b[38;2;239;68;68m",
  brightRed: "\x1b[38;2;248;113;113m",
  brightWhite: "\x1b[97m",
  brightCyan: "\x1b[96m",
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  gray: "\x1b[90m",
  white: "\x1b[37m",
  bgRed: "\x1b[41m",
  bgEmerald: "\x1b[42m",
};

const c = colors;

export const CLI_VERSION = "1.1.0";

/**
 * Original Whizan Cloud logo rendered as ANSI truecolor half-block pixels.
 * Sourced directly from whizan_icon.png / whizan_logo.png
 */
export const WHIZAN_PIXEL_LOGO = [
  "               \x1b[38;2;25;226;240m▄\x1b[0m\x1b[38;2;3;215;249m▄\x1b[0m\x1b[38;2;1;209;252m▄\x1b[0m\x1b[38;2;0;226;240m\x1b[48;2;1;206;252m▀\x1b[0m\x1b[38;2;0;233;248m\x1b[48;2;0;211;255m▀\x1b[0m\x1b[38;2;0;234;247m\x1b[48;2;0;211;253m▀\x1b[0m\x1b[38;2;0;222;239m\x1b[48;2;0;214;252m▀\x1b[0m\x1b[38;2;4;210;249m▄\x1b[0m\x1b[38;2;20;194;243m▄\x1b[0m       ",
  "             \x1b[38;2;64;237;249m▄\x1b[0m\x1b[38;2;26;227;246m\x1b[48;2;6;194;255m▀\x1b[0m\x1b[38;2;8;201;252m\x1b[48;2;0;157;252m▀\x1b[0m\x1b[38;2;0;190;255m\x1b[48;2;0;150;252m▀\x1b[0m\x1b[38;2;0;180;254m\x1b[48;2;0;148;252m▀\x1b[0m\x1b[38;2;0;176;252m\x1b[48;2;0;164;252m▀\x1b[0m\x1b[38;2;0;176;252m\x1b[48;2;63;199;253m▀\x1b[0m\x1b[38;2;0;177;252m\x1b[48;2;142;222;253m▀\x1b[0m\x1b[38;2;0;178;252m\x1b[48;2;177;230;252m▀\x1b[0m\x1b[38;2;0;181;255m\x1b[48;2;169;222;252m▀\x1b[0m\x1b[38;2;0;175;253m\x1b[48;2;110;189;253m▀\x1b[0m\x1b[38;2;9;169;246m\x1b[48;2;25;148;255m▀\x1b[0m\x1b[38;2;0;128;245m▄\x1b[0m     ",
  "        \x1b[38;2;35;87;243m▄\x1b[0m\x1b[38;2;24;73;247m▄\x1b[0m\x1b[38;2;16;56;245m▄\x1b[0m\x1b[38;2;150;171;249m▄\x1b[0m\x1b[38;2;158;243;249m\x1b[48;2;158;188;255m▀\x1b[0m\x1b[38;2;50;184;255m\x1b[48;2;31;72;253m▀\x1b[0m\x1b[38;2;0;119;252m\x1b[48;2;9;68;252m▀\x1b[0m\x1b[38;2;0;117;252m\x1b[48;2;0;69;252m▀\x1b[0m\x1b[38;2;0;112;252m\x1b[48;2;11;90;253m▀\x1b[0m\x1b[38;2;16;143;252m\x1b[48;2;178;214;253m▀\x1b[0m\x1b[38;2;159;222;252m\x1b[48;2;244;253;252m▀\x1b[0m\x1b[38;2;244;252;253m\x1b[48;2;222;243;251m▀\x1b[0m\x1b[38;2;244;251;252m\x1b[48;2;218;240;251m▀\x1b[0m\x1b[38;2;236;248;252m\x1b[48;2;217;239;251m▀\x1b[0m\x1b[38;2;237;249;252m\x1b[48;2;216;238;251m▀\x1b[0m\x1b[38;2;246;253;252m\x1b[48;2;219;240;251m▀\x1b[0m\x1b[38;2;213;231;254m\x1b[48;2;240;251;252m▀\x1b[0m\x1b[38;2;69;140;252m\x1b[48;2;238;244;255m▀\x1b[0m\x1b[38;2;0;69;241m\x1b[48;2;104;144;248m▀\x1b[0m    ",
  "     \x1b[38;2;101;133;239m▄\x1b[0m\x1b[38;2;22;75;241m\x1b[48;2;81;121;252m▀\x1b[0m\x1b[38;2;8;64;250m\x1b[48;2;67;108;255m▀\x1b[0m\x1b[38;2;0;53;255m\x1b[48;2;67;105;253m▀\x1b[0m\x1b[38;2;0;40;255m\x1b[48;2;68;97;249m▀\x1b[0m\x1b[38;2;41;73;255m\x1b[48;2;171;166;250m▀\x1b[0m\x1b[38;2;185;169;255m\x1b[48;2;189;143;253m▀\x1b[0m\x1b[38;2;100;67;252m\x1b[48;2;118;73;253m▀\x1b[0m\x1b[38;2;36;17;252m\x1b[48;2;98;66;253m▀\x1b[0m\x1b[38;2;18;18;253m\x1b[48;2;80;62;253m▀\x1b[0m\x1b[38;2;1;19;253m\x1b[48;2;114;106;253m▀\x1b[0m\x1b[38;2;133;155;253m\x1b[48;2;226;237;252m▀\x1b[0m\x1b[38;2;241;253;252m\x1b[48;2;215;236;251m▀\x1b[0m\x1b[38;2;217;239;251m\x1b[48;2;208;231;251m▀\x1b[0m\x1b[38;2;212;235;251m\x1b[48;2;205;229;251m▀\x1b[0m\x1b[38;2;210;234;251m\x1b[48;2;204;229;251m▀\x1b[0m\x1b[38;2;210;234;251m\x1b[48;2;207;230;251m▀\x1b[0m\x1b[38;2;213;236;251m\x1b[48;2;223;240;252m▀\x1b[0m\x1b[38;2;229;244;252m\x1b[48;2;108;214;252m▀\x1b[0m\x1b[38;2;178;234;252m\x1b[48;2;1;188;252m▀\x1b[0m\x1b[38;2;122;227;253m\x1b[48;2;0;191;252m▀\x1b[0m\x1b[38;2;73;215;253m\x1b[48;2;0;198;251m▀\x1b[0m\x1b[38;2;30;232;250m\x1b[48;2;2;217;255m▀\x1b[0m\x1b[38;2;59;240;240m\x1b[48;2;15;230;253m▀\x1b[0m\x1b[38;2;49;240;245m▄\x1b[0m ",
  "  \x1b[38;2;8;218;240m▄\x1b[0m\x1b[38;2;13;233;252m▄\x1b[0m\x1b[38;2;93;218;244m▄\x1b[0m\x1b[38;2;226;233;248m\x1b[48;2;144;191;253m▀\x1b[0m\x1b[38;2;255;255;255m\x1b[48;2;99;181;248m▀\x1b[0m\x1b[38;2;251;255;252m\x1b[48;2;77;103;222m▀\x1b[0m\x1b[38;2;250;255;253m\x1b[48;2;69;89;221m▀\x1b[0m\x1b[38;2;250;255;252m\x1b[48;2;74;94;224m▀\x1b[0m\x1b[38;2;252;255;254m\x1b[48;2;139;154;237m▀\x1b[0m\x1b[38;2;237;244;252m\x1b[48;2;230;239;252m▀\x1b[0m\x1b[38;2;234;243;252m\x1b[48;2;218;232;250m▀\x1b[0m\x1b[38;2;231;242;252m\x1b[48;2;212;228;250m▀\x1b[0m\x1b[38;2;227;240;252m\x1b[48;2;206;226;250m▀\x1b[0m\x1b[38;2;224;240;251m\x1b[48;2;210;226;250m▀\x1b[0m\x1b[38;2;215;231;251m\x1b[48;2;176;234;251m▀\x1b[0m\x1b[38;2;215;230;251m\x1b[48;2;101;238;251m▀\x1b[0m\x1b[38;2;211;230;251m\x1b[48;2;113;238;252m▀\x1b[0m\x1b[38;2;207;227;251m\x1b[48;2;162;238;251m▀\x1b[0m\x1b[38;2;201;226;251m\x1b[48;2;218;238;252m▀\x1b[0m\x1b[38;2;221;235;252m\x1b[48;2;197;232;252m▀\x1b[0m\x1b[38;2;131;217;252m\x1b[48;2;53;180;251m▀\x1b[0m\x1b[38;2;0;183;252m\x1b[48;2;103;180;252m▀\x1b[0m\x1b[38;2;8;189;252m\x1b[48;2;133;183;252m▀\x1b[0m\x1b[38;2;6;194;252m\x1b[48;2;117;179;252m▀\x1b[0m\x1b[38;2;0;201;252m\x1b[48;2;63;176;252m▀\x1b[0m\x1b[38;2;0;199;251m\x1b[48;2;7;189;252m▀\x1b[0m\x1b[38;2;0;202;253m\x1b[48;2;0;192;251m▀\x1b[0m\x1b[38;2;13;221;251m\x1b[48;2;0;197;252m▀\x1b[0m\x1b[38;2;0;214;255m▄\x1b[0m",
  "\x1b[38;2;201;66;246m▄\x1b[0m\x1b[38;2;169;72;249m▄\x1b[0m\x1b[38;2;0;239;239m\x1b[48;2;117;77;248m▀\x1b[0m\x1b[38;2;0;213;246m\x1b[48;2;69;85;246m▀\x1b[0m\x1b[38;2;158;232;245m\x1b[48;2;72;147;249m▀\x1b[0m\x1b[38;2;164;212;255m\x1b[48;2;106;191;253m▀\x1b[0m\x1b[38;2;80;160;245m\x1b[48;2;189;227;254m▀\x1b[0m\x1b[38;2;0;20;207m\x1b[48;2;55;92;233m▀\x1b[0m\x1b[38;2;0;25;207m\x1b[48;2;0;34;216m▀\x1b[0m\x1b[38;2;0;26;208m\x1b[48;2;0;42;217m▀\x1b[0m\x1b[38;2;0;22;209m\x1b[48;2;0;40;218m▀\x1b[0m\x1b[38;2;132;152;241m\x1b[48;2;21;60;226m▀\x1b[0m\x1b[38;2;224;236;252m\x1b[48;2;198;213;251m▀\x1b[0m\x1b[38;2;203;221;250m\x1b[48;2;201;220;251m▀\x1b[0m\x1b[38;2;205;221;251m\x1b[48;2;207;225;253m▀\x1b[0m\x1b[38;2;182;234;252m\x1b[48;2;69;98;220m▀\x1b[0m\x1b[38;2;30;242;252m\x1b[48;2;8;86;204m▀\x1b[0m\x1b[38;2;0;235;251m\x1b[48;2;3;232;250m▀\x1b[0m\x1b[38;2;36;232;252m\x1b[48;2;18;228;251m▀\x1b[0m\x1b[38;2;58;230;252m\x1b[48;2;41;222;252m▀\x1b[0m\x1b[38;2;125;239;252m\x1b[48;2;40;216;252m▀\x1b[0m\x1b[38;2;182;220;253m\x1b[48;2;143;229;253m▀\x1b[0m\x1b[38;2;150;174;252m\x1b[48;2;215;209;252m▀\x1b[0m\x1b[38;2;196;196;252m\x1b[48;2;215;204;251m▀\x1b[0m\x1b[38;2;210;208;251m\x1b[48;2;230;216;251m▀\x1b[0m\x1b[38;2;207;209;251m\x1b[48;2;228;217;251m▀\x1b[0m\x1b[38;2;177;195;252m\x1b[48;2;219;214;252m▀\x1b[0m\x1b[38;2;87;183;252m\x1b[48;2;171;202;252m▀\x1b[0m\x1b[38;2;1;181;252m\x1b[48;2;12;159;251m▀\x1b[0m\x1b[38;2;0;182;252m\x1b[48;2;0;157;252m▀\x1b[0m\x1b[38;2;0;184;255m\x1b[48;2;0;156;255m▀\x1b[0m",
  "\x1b[38;2;178;41;248m▀\x1b[0m\x1b[38;2;140;44;253m▀\x1b[0m\x1b[38;2;93;49;252m\x1b[48;2;14;140;246m▀\x1b[0m\x1b[38;2;48;77;252m\x1b[48;2;6;145;242m▀\x1b[0m\x1b[38;2;7;113;251m\x1b[48;2;10;165;247m▀\x1b[0m\x1b[38;2;44;150;252m\x1b[48;2;106;212;253m▀\x1b[0m\x1b[38;2;174;222;252m\x1b[48;2;126;217;255m▀\x1b[0m\x1b[38;2;167;195;251m\x1b[48;2;184;235;255m▀\x1b[0m\x1b[38;2;1;49;230m\x1b[48;2;67;120;247m▀\x1b[0m\x1b[38;2;0;51;227m\x1b[48;2;0;56;238m▀\x1b[0m\x1b[38;2;0;56;231m\x1b[48;2;0;68;240m▀\x1b[0m\x1b[38;2;0;47;230m\x1b[48;2;0;67;242m▀\x1b[0m\x1b[38;2;97;135;245m\x1b[48;2;8;75;245m▀\x1b[0m\x1b[38;2;226;239;253m\x1b[48;2;173;199;253m▀\x1b[0m\x1b[38;2;143;169;246m\x1b[48;2;40;85;236m▀\x1b[0m\x1b[38;2;0;18;207m\x1b[48;2;0;31;216m▀\x1b[0m\x1b[38;2;0;0;183m\x1b[48;2;0;18;202m▀\x1b[0m\x1b[38;2;1;132;222m\x1b[48;2;0;22;194m▀\x1b[0m\x1b[38;2;4;225;253m\x1b[48;2;4;169;244m▀\x1b[0m\x1b[38;2;24;207;251m\x1b[48;2;22;182;252m▀\x1b[0m\x1b[38;2;37;197;252m\x1b[48;2;44;165;252m▀\x1b[0m\x1b[38;2;53;189;252m\x1b[48;2;55;145;252m▀\x1b[0m\x1b[38;2;203;225;252m\x1b[48;2;116;155;253m▀\x1b[0m\x1b[38;2;233;211;251m\x1b[48;2;244;223;253m▀\x1b[0m\x1b[38;2;232;211;251m\x1b[48;2;235;207;251m▀\x1b[0m\x1b[38;2;231;213;251m\x1b[48;2;237;214;252m▀\x1b[0m\x1b[38;2;234;221;251m\x1b[48;2;226;214;253m▀\x1b[0m\x1b[38;2;170;194;253m\x1b[48;2;91;112;253m▀\x1b[0m\x1b[38;2;21;122;252m\x1b[48;2;48;93;254m▀\x1b[0m\x1b[38;2;15;131;252m\x1b[48;2;59;112;252m▀\x1b[0m\x1b[38;2;28;138;255m▀\x1b[0m",
  "  \x1b[38;2;1;122;248m▀\x1b[0m\x1b[38;2;2;145;243m▀\x1b[0m\x1b[38;2;0;145;249m▀\x1b[0m\x1b[38;2;0;149;252m\x1b[48;2;0;135;248m▀\x1b[0m\x1b[38;2;0;151;252m\x1b[48;2;0;143;239m▀\x1b[0m\x1b[38;2;91;196;252m▀\x1b[0m\x1b[38;2;178;214;252m\x1b[48;2;219;248;251m▀\x1b[0m\x1b[38;2;6;82;249m\x1b[48;2;88;166;255m▀\x1b[0m\x1b[38;2;0;77;247m\x1b[48;2;0;86;251m▀\x1b[0m\x1b[38;2;0;77;246m\x1b[48;2;0;77;246m▀\x1b[0m\x1b[38;2;1;70;245m\x1b[48;2;19;85;244m▀\x1b[0m\x1b[38;2;31;96;250m\x1b[48;2;11;88;252m▀\x1b[0m\x1b[38;2;0;58;238m\x1b[48;2;0;68;247m▀\x1b[0m\x1b[38;2;0;50;231m\x1b[48;2;0;65;244m▀\x1b[0m\x1b[38;2;0;39;221m\x1b[48;2;0;60;243m▀\x1b[0m\x1b[38;2;0;22;212m\x1b[48;2;10;64;240m▀\x1b[0m\x1b[38;2;10;79;230m\x1b[48;2;29;58;233m▀\x1b[0m\x1b[38;2;38;139;254m\x1b[48;2;53;80;248m▀\x1b[0m\x1b[38;2;58;117;253m\x1b[48;2;76;74;255m▀\x1b[0m\x1b[38;2;75;101;252m\x1b[48;2;88;61;252m▀\x1b[0m\x1b[38;2;80;79;252m\x1b[48;2;97;54;252m▀\x1b[0m\x1b[38;2;186;162;253m\x1b[48;2;121;62;253m▀\x1b[0m\x1b[38;2;250;223;252m\x1b[48;2;236;201;253m▀\x1b[0m\x1b[38;2;240;216;252m\x1b[48;2;190;122;253m▀\x1b[0m\x1b[38;2;143;111;252m\x1b[48;2;121;41;252m▀\x1b[0m\x1b[38;2;83;62;252m\x1b[48;2;126;60;255m▀\x1b[0m\x1b[38;2;90;81;255m\x1b[48;2;138;82;248m▀\x1b[0m\x1b[38;2;95;97;245m▀\x1b[0m ",
  "        \x1b[38;2;214;240;251m▀\x1b[0m\x1b[38;2;190;237;254m\x1b[48;2;218;245;249m▀\x1b[0m\x1b[38;2;16;126;253m\x1b[48;2;130;220;255m▀\x1b[0m\x1b[38;2;5;75;243m\x1b[48;2;19;147;255m▀\x1b[0m\x1b[38;2;20;115;249m\x1b[48;2;1;126;252m▀\x1b[0m\x1b[38;2;0;94;252m\x1b[48;2;0;115;252m▀\x1b[0m\x1b[38;2;0;90;252m\x1b[48;2;0;117;255m▀\x1b[0m\x1b[38;2;0;86;253m\x1b[48;2;5;127;255m▀\x1b[0m\x1b[38;2;6;92;253m\x1b[48;2;23;133;244m▀\x1b[0m\x1b[38;2;31;104;243m▀\x1b[0m \x1b[38;2;64;32;234m▀\x1b[0m\x1b[38;2;93;45;252m\x1b[48;2;107;25;242m▀\x1b[0m\x1b[38;2;105;41;254m\x1b[48;2;133;27;255m▀\x1b[0m\x1b[38;2;115;38;252m\x1b[48;2;139;20;254m▀\x1b[0m\x1b[38;2;125;31;253m\x1b[48;2;151;20;253m▀\x1b[0m\x1b[38;2;177;81;253m\x1b[48;2;163;14;253m▀\x1b[0m\x1b[38;2;186;58;252m\x1b[48;2;204;50;255m▀\x1b[0m\x1b[38;2;162;37;255m\x1b[48;2;209;65;252m▀\x1b[0m\x1b[38;2;177;72;249m\x1b[48;2;234;124;234m▀\x1b[0m   ",
  "          \x1b[38;2;174;238;245m▀\x1b[0m\x1b[38;2;74;201;253m▀\x1b[0m\x1b[38;2;14;156;252m\x1b[48;2;60;210;240m▀\x1b[0m\x1b[38;2;8;149;252m\x1b[48;2;43;188;237m▀\x1b[0m\x1b[38;2;13;152;251m▀\x1b[0m\x1b[38;2;25;159;245m▀\x1b[0m     \x1b[38;2;145;33;243m▀\x1b[0m\x1b[38;2;162;17;252m\x1b[48;2;165;58;230m▀\x1b[0m\x1b[38;2;182;12;255m\x1b[48;2;197;47;248m▀\x1b[0m\x1b[38;2;187;11;253m\x1b[48;2;202;48;241m▀\x1b[0m\x1b[38;2;192;18;250m▀\x1b[0m\x1b[38;2;197;53;239m▀\x1b[0m    "
];

export function printBanner(version: string = CLI_VERSION) {
  const c = colors;
  const textLines = [
    `${c.whizanCyan}██╗    ██╗██╗  ██╗██╗███████╗ █████╗ ███╗   ██╗${c.reset}`,
    `${c.whizanCyan}██║    ██║██║  ██║██║╚══███╔╝██╔══██╗████╗  ██║${c.reset}`,
    `${c.whizanBlue}██║ █╗ ██║███████║██║  ███╔╝ ███████║██╔██╗ ██║${c.reset}`,
    `${c.whizanBlue}██║███╗██║██╔══██║██║ ███╔╝  ██╔══██║██║╚██╗██║${c.reset}`,
    `${c.whizanPurple}╚███╔███╔╝██║  ██║██║███████╗██║  ██║██║ ╚████║${c.reset}`,
    `${c.whizanPurple} ╚══╝╚══╝ ╚═╝  ╚═╝╚═╝╚══════╝╚═╝  ╚═╝╚═╝  ╚═══╝${c.reset}`,
  ];

  console.error("");
  const textOffset = 2;
  for (let i = 0; i < WHIZAN_PIXEL_LOGO.length; i++) {
    const icon = WHIZAN_PIXEL_LOGO[i];
    const tIdx = i - textOffset;
    const text = tIdx >= 0 && tIdx < textLines.length ? textLines[tIdx] : "";
    console.error(`  ${icon}   ${text}`);
  }
  console.error(`                                    ${c.brightWhite}Whizan Cloud CLI${c.reset} ${c.dim}•${c.reset} ${c.emerald}v${version}${c.reset}\n`);
}

/**
 * Minimal spinner for terminal progress indication
 */
export class Spinner {
  private frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
  private current = 0;
  private interval: NodeJS.Timeout | null = null;
  private text: string;

  constructor(text: string) {
    this.text = text;
  }

  start(): this {
    this.interval = setInterval(() => {
      const frame = this.frames[this.current % this.frames.length];
      process.stderr.write(`\r  ${c.whizanCyan}${frame}${c.reset} ${this.text}`);
      this.current++;
    }, 80);
    return this;
  }

  update(text: string) {
    this.text = text;
  }

  succeed(text?: string) {
    this.stop();
    console.error(`\r  ${c.emerald}✔${c.reset} ${text || this.text}`);
  }

  fail(text?: string) {
    this.stop();
    console.error(`\r  ${c.red}✖${c.reset} ${text || this.text}`);
  }

  warn(text?: string) {
    this.stop();
    console.error(`\r  ${c.amber}⚠${c.reset} ${text || this.text}`);
  }

  info(text?: string) {
    this.stop();
    console.error(`\r  ${c.whizanCyan}ℹ${c.reset} ${text || this.text}`);
  }

  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
      process.stderr.write("\r\x1b[K"); // Clear spinner line
    }
  }
}

/**
 * Print a step header like [1/6] 🔍 Analyzing workspace...
 */
export function step(current: number, total: number, emoji: string, text: string) {
  console.error(`\n  ${c.dim}[${current}/${total}]${c.reset} ${emoji} ${c.bold}${text}${c.reset}`);
}

/**
 * Print a success box with the final deployment URL
 */
export function printDeploySuccess(url: string, dashboardUrl?: string) {
  const line = "━".repeat(52);
  console.error(`
  ${c.dim}${line}${c.reset}
  ${c.emerald}${c.bold}🎉 Deploy successful!${c.reset}
  ${c.whizanCyan}🔗 ${url}${c.reset}${dashboardUrl ? `\n  ${c.dim}📋 ${dashboardUrl}${c.reset}` : ""}
  ${c.dim}${line}${c.reset}
`);
}

/**
 * Print an error message
 */
export function printError(message: string) {
  console.error(`\n  ${c.red}${c.bold}Error:${c.reset} ${message}\n`);
}

/**
 * Print a key-value info line
 */
export function printKV(key: string, value: string) {
  console.error(`  ${c.dim}${key}:${c.reset} ${c.bold}${value}${c.reset}`);
}

/**
 * Print build log lines with coloring
 */
export function printBuildLog(line: string) {
  const trimmed = line.trim();
  if (!trimmed) return;

  if (trimmed.startsWith("[Worker]") || trimmed.startsWith("Step ")) {
    console.error(`  ${c.dim}├─${c.reset} ${trimmed}`);
  } else if (trimmed.includes("ERROR") || trimmed.includes("error")) {
    console.error(`  ${c.red}├─ ${trimmed}${c.reset}`);
  } else {
    console.error(`  ${c.dim}│  ${trimmed}${c.reset}`);
  }
}

/**
 * Simple readline prompt (no external dependency)
 */
export async function prompt(question: string, defaultValue?: string): Promise<string> {
  const readline = await import("readline");
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stderr,
    });
    const suffix = defaultValue ? ` ${c.dim}(${defaultValue})${c.reset}` : "";
    rl.question(`  ${c.whizanCyan}?${c.reset} ${question}${suffix}: `, (answer) => {
      rl.close();
      resolve(answer.trim() || defaultValue || "");
    });
  });
}

/**
 * Yes/No confirmation prompt
 */
export async function confirm(question: string, defaultYes = true): Promise<boolean> {
  const hint = defaultYes ? "Y/n" : "y/N";
  const answer = await prompt(`${question} (${hint})`);
  if (!answer) return defaultYes;
  return answer.toLowerCase().startsWith("y");
}

