import { FC, SVGProps } from "react";

export interface TechItem {
  id: string;
  name: string;
  category: "Frontend" | "Backend" | "Database" | "DevOps";
  Icon: FC<SVGProps<SVGSVGElement>>;
}

export const NextJsLogo: FC<SVGProps<SVGSVGElement>> = (props) => (
  <svg viewBox="0 0 180 180" width="22" height="22" fill="none" {...props}>
    <circle cx="90" cy="90" r="90" fill="#000000" />
    <path
      d="M149.508 157.538L69.142 54H54V125.97H66.1136V69.3836L139.999 164.845C143.333 162.614 146.509 160.176 149.508 157.538Z"
      fill="url(#next-g1)"
    />
    <rect x="115" y="54" width="12" height="72" fill="url(#next-g2)" />
    <defs>
      <linearGradient id="next-g1" x1="109" y1="116.5" x2="144.5" y2="160.5" gradientUnits="userSpaceOnUse">
        <stop stopColor="white" />
        <stop offset="1" stopColor="white" stopOpacity="0" />
      </linearGradient>
      <linearGradient id="next-g2" x1="121" y1="54" x2="120.799" y2="106.875" gradientUnits="userSpaceOnUse">
        <stop stopColor="white" />
        <stop offset="1" stopColor="white" stopOpacity="0" />
      </linearGradient>
    </defs>
  </svg>
);

export const ReactLogo: FC<SVGProps<SVGSVGElement>> = (props) => (
  <svg viewBox="-11.5 -10.23174 23 20.46348" width="22" height="22" fill="none" {...props}>
    <circle cx="0" cy="0" r="2.05" fill="#61DAFB" />
    <g stroke="#61DAFB" strokeWidth="1" fill="none">
      <ellipse rx="11" ry="4.2" />
      <ellipse rx="11" ry="4.2" transform="rotate(60)" />
      <ellipse rx="11" ry="4.2" transform="rotate(120)" />
    </g>
  </svg>
);

export const TypeScriptLogo: FC<SVGProps<SVGSVGElement>> = (props) => (
  <svg viewBox="0 0 128 128" width="20" height="20" {...props}>
    <rect width="128" height="128" rx="16" fill="#3178C6" />
    <path
      fill="#FFF"
      d="M68.5 76.5c1.6 3.8 4.2 6.8 7.7 9 3.5 2.2 7.7 3.3 12.6 3.3 4.2 0 7.7-.8 10.5-2.5 2.8-1.7 4.2-4.1 4.2-7.2 0-2.3-.9-4.2-2.7-5.7-1.8-1.5-4.7-2.9-8.7-4.1l-6.8-2c-6.1-1.8-10.7-4.3-13.8-7.5-3.1-3.2-4.7-7.4-4.7-12.6 0-5.8 2.2-10.5 6.6-14.1 4.4-3.6 10.3-5.4 17.7-5.4 6.8 0 12.7 1.6 17.7 4.8 5 3.2 8.3 7.8 9.9 13.8l-12.7 5.2c-1.1-3.4-3-6-5.7-7.8-2.7-1.8-6-2.7-9.9-2.7-3.7 0-6.7.8-9 2.4-2.3 1.6-3.5 3.7-3.5 6.3 0 2.1.8 3.8 2.4 5.1 1.6 1.3 4.4 2.5 8.4 3.6l6.8 2c6.5 1.8 11.3 4.4 14.4 7.8 3.1 3.4 4.7 7.7 4.7 12.9 0 6.1-2.3 11-6.9 14.7-4.6 3.7-10.8 5.6-18.6 5.6-7.8 0-14.5-1.9-20.1-5.7-5.6-3.8-9.4-9.2-11.4-16.2l13.1-4.7zM17.4 32.1h41.4V45H43.9v50.9H29.1V45H17.4V32.1z"
    />
  </svg>
);

export const NodeJsLogo: FC<SVGProps<SVGSVGElement>> = (props) => (
  <svg viewBox="0 0 32 32" width="22" height="22" fill="none" {...props}>
    <path d="M16 2.5L3.2 9.9v14.8L16 32.1l12.8-7.4V9.9L16 2.5z" fill="#539E43" />
    <path
      d="M16 11.2c.4 0 .8.1 1.1.3l5.5 3.2c.7.4 1.1 1.1 1.1 1.9v6.4c0 .8-.4 1.5-1.1 1.9l-5.5 3.2c-.7.4-1.5.4-2.2 0l-5.5-3.2c-.7-.4-1.1-1.1-1.1-1.9v-6.4c0-.8.4-1.5 1.1-1.9l5.5-3.2c.3-.2.7-.3 1.1-.3z"
      fill="#333333"
    />
    <path
      d="M17.8 17.5v-2.8h-1.6v2.8c0 .5-.2.8-.7.8s-.7-.3-.7-.8v-2.8h-1.6v2.8c0 1.4.9 2.2 2.3 2.2s2.3-.8 2.3-2.2z"
      fill="#539E43"
    />
  </svg>
);

export const PythonLogo: FC<SVGProps<SVGSVGElement>> = (props) => (
  <svg viewBox="0 0 128 128" width="20" height="20" {...props}>
    <path
      fill="url(#python-blue)"
      d="M63.5 1.8c-7.9 0-15.5.7-22.1 2-19.1 3.7-22.5 11.5-22.5 25.7v18.8h45.2v6.3H20.3C6.8 54.6 0 62.7 0 78.4c0 15.6 5.3 24.8 19.3 27.5 6.2 1.2 12.8 1.8 19.8 1.8v-17c0-8.9 7.7-16.6 16.6-16.6h31.8c7.3 0 13.2-6 13.2-13.3V29.5c0-13.9-6-21.7-22.1-25.7-4.9-1.3-10.2-2-15.1-2zm-12.7 9.8c3.9 0 7.1 3.2 7.1 7.1s-3.2 7.1-7.1 7.1-7.1-3.2-7.1-7.1 3.2-7.1 7.1-7.1z"
    />
    <path
      fill="url(#python-yellow)"
      d="M64.5 126.2c7.9 0 15.5-.7 22.1-2 19.1-3.7 22.5-11.5 22.5-25.7V79.7H63.9v-6.3h43.8c13.5 0 20.3-8.1 20.3-23.8 0-15.6-5.3-24.8-19.3-27.5-6.2-1.2-12.8-1.8-19.8-1.8v17c0 8.9-7.7 16.6-16.6 16.6H40.5c-7.3 0-13.2 6-13.2 13.3v31.3c0 13.9 6 21.7 22.1 25.7 4.9 1.3 10.2 2 15.1 2zm12.7-9.8c-3.9 0-7.1-3.2-7.1-7.1s3.2-7.1 7.1-7.1 7.1 3.2 7.1 7.1-3.2 7.1-7.1 7.1z"
    />
    <defs>
      <linearGradient id="python-blue" x1="14" y1="8" x2="65" y2="58" gradientUnits="userSpaceOnUse">
        <stop stopColor="#387EB8" />
        <stop offset="1" stopColor="#366994" />
      </linearGradient>
      <linearGradient id="python-yellow" x1="64" y1="67" x2="114" y2="120" gradientUnits="userSpaceOnUse">
        <stop stopColor="#FFE873" />
        <stop offset="1" stopColor="#FFD43B" />
      </linearGradient>
    </defs>
  </svg>
);

export const GoLogo: FC<SVGProps<SVGSVGElement>> = (props) => (
  <svg viewBox="0 0 128 128" width="22" height="22" {...props}>
    <path
      fill="#00ADD8"
      d="M12.8 55.7c4.6-2.5 10.5-3.9 16.8-3.9 9.8 0 17.8 3.5 22.6 9.8l-7.3 6.4c-3.5-4.4-8.7-6.8-15.3-6.8-4.5 0-8.6 1-11.7 2.8-4.4 2.5-6.9 6.7-6.9 11.7 0 5.4 2.6 9.6 7.2 12.1 3.1 1.7 7.1 2.6 11.4 2.6 7.7 0 13.6-3.1 16.7-8.8H28.7v-9.1h30.1v14.4c-4.4 8.7-14 13.9-26.6 13.9-8.4 0-15.7-2.1-20.9-5.9C3.8 89.2 0 81.3 0 71.9c0-9 4-16.7 12.8-22.2zM73.2 71.9c0-12.7 9.8-20.1 25.1-20.1 15.3 0 25.1 7.4 25.1 20.1 0 12.7-9.8 20.1-25.1 20.1-15.3 0-25.1-7.4-25.1-20.1zm39.1 0c0-7.3-5.2-11.4-14-11.4s-14 4.1-14 11.4 5.2 11.4 14 11.4 14-4.1 14-11.4z"
    />
  </svg>
);

export const RustLogo: FC<SVGProps<SVGSVGElement>> = (props) => (
  <svg viewBox="0 0 106 106" width="20" height="20" fill="currentColor" {...props}>
    <path d="M53 0c-2.4 0-4.7.4-6.9 1.1l-1.5 5.8-5.3 1.1-4.7-3.9-5.4 3.1.8 6-4.5 2.8-5.7-2.2-3.4 5.3 3.3 5.2-3.1 4.3-6.1-.3-1.2 6.1 5.3 3.1-1.3 5.1-6.1 1.6.9 6.2 6.1.7.5 5.2-5.4 3.4 2.9 5.6 5.8-1.7 2.4 4.7-3.9 4.7 4.6 4.3 4.8-3.7 3.8 3.7-1.8 5.8 5.7 2.8 3.3-5.1 5 2.5.4 6 6.1 1.1 1.6-5.8 5.3 1.1 2.3 5.7 6.1-.7 2.7-5.5 5.4 2.4.9 6.1 6.1-.7-.2-6.1 5.1-2.4 3.5 5.1 5.6-2.5-2.2-5.7 4.1-3.6 4.9 3.5 4.8-4.2-3.8-4.8 2.6-4.7 5.7 1.6 3.1-5.5-5.2-3.5.7-5.2 6.1-.6 1.1-6.2-5.9-1.7-1.2-5.1 5.4-3.2-1.1-6-6.1.4-3.1-4.3 3.3-5.2-3.3-5.2-5.7 2.1-4.4-2.8.9-6-5.3-3.2-4.7 3.8-5.3-1.1-1.4-5.8C57.7.4 55.4 0 53 0zm0 13c22.1 0 40 17.9 40 40s-17.9 40-40 40S13 75.1 13 53s17.9-40 40-40zm-17 19v42h11V58h10.5l9.5 16H80L69.5 57C75.3 55.2 79 50 79 43.5 79 35.5 72.5 32 63.5 32H36zm11 9.5h15c4.7 0 7.5 1.8 7.5 5.5s-2.8 5.5-7.5 5.5H47v-11z" />
  </svg>
);

export const DockerLogo: FC<SVGProps<SVGSVGElement>> = (props) => (
  <svg viewBox="0 0 128 128" width="22" height="22" {...props}>
    <path
      fill="#2496ED"
      d="M121.2 55.4c-2.3-1.6-7.3-2.4-12.2-1.2-.8-5.7-4.7-10.4-10-12.8l-2.2-1-.9 2.2c-1.8 4.3-1.5 9 .6 13.5-3.3 1.9-8.4 2.4-14.7 1.3l-1.3-.2-.5 1.2c-4 9.4-11.6 14.8-22.3 16-16.4 1.8-33.8-5-44.5-17.3L12 55.8 4 64.9C.9 68.4-.2 72.9 0 77.5c.9 14.2 12.3 26 27.2 28.3 13.9 2.1 34.3 2.1 48.7-.3 23.4-3.9 42.1-19.7 48.3-40.8 1.4-4.8 1.3-7.5-3-9.3zM46.7 42.4h11.2v10.5H46.7V42.4zm0-13h11.2v10.5H46.7V29.4zm-13.8 13h11.2v10.5H32.9V42.4zm0-13h11.2v10.5H32.9V29.4zm-13.8 13h11.2v10.5H19.1V42.4zm27.6-26.1h11.2v10.5H46.7V16.3zm13.8 13.1h11.2v10.5H60.5V29.4zm0 13h11.2v10.5H60.5V42.4zm13.8 0h11.2v10.5H74.3V42.4z"
    />
  </svg>
);

export const PostgresLogo: FC<SVGProps<SVGSVGElement>> = (props) => (
  <svg viewBox="0 0 128 128" width="20" height="20" {...props}>
    <path
      fill="#336791"
      d="M63.7 4c-31 0-56.1 23.5-56.1 52.5 0 17.6 9.3 33.1 23.6 42.7l1.7 1.1-1.2 5.1c-2.4 10.3-6.5 16-12.9 18l7.3 3.9c12.2-2.1 19.3-10.7 22.8-21.7l.8-2.6 2.7.4c3.6.5 7.4.8 11.3.8 31 0 56.1-23.5 56.1-52.5S94.7 4 63.7 4zm28.7 65.6c-1.3 3.1-4 6.1-7.8 8.6-4.8 3.1-11 5.3-17.7 6.3-5.2.8-9.4.2-12.6-1.7-2.9-1.7-4.6-4.5-5-8-.4-3.5.7-7.4 3.2-11.4 3.5-5.6 9.5-10.6 16.5-13.6 5.5-2.4 11-3.6 15.8-3.4 4.5.2 7.7 1.9 9.1 4.7 1.4 2.8 1.1 6.5-.8 10.5z"
    />
  </svg>
);

export const RedisLogo: FC<SVGProps<SVGSVGElement>> = (props) => (
  <svg viewBox="0 0 128 128" width="20" height="20" {...props}>
    <path
      fill="#D82C20"
      d="M121.7 45.3L67.1 20.9c-2-.9-4.2-.9-6.2 0L6.3 45.3c-2.5 1.1-3.9 3.5-3.3 6.2l12.7 54.9c.6 2.5 2.5 4.5 5.1 5.1l40.3 8.9c1.9.4 3.9.4 5.8 0l40.3-8.9c2.5-.6 4.5-2.6 5.1-5.1l12.7-54.9c.7-2.7-.7-5.1-3.3-6.2z"
    />
    <path
      fill="#FFFFFF"
      d="M44.5 46.2c0-3.3 2.7-6 6-6s6 2.7 6 6-2.7 6-6 6-6-2.7-6-6zm33 0c0-3.3 2.7-6 6-6s6 2.7 6 6-2.7 6-6 6-6-2.7-6-6zm-16.5 32c-9.1 0-16.5-7.4-16.5-16.5h33c0 9.1-7.4 16.5-16.5 16.5z"
    />
  </svg>
);

export const ViteLogo: FC<SVGProps<SVGSVGElement>> = (props) => (
  <svg viewBox="0 0 128 128" width="20" height="20" {...props}>
    <path
      fill="url(#vite-a)"
      d="M123.6 18.2L68.7 122.9c-1.8 3.5-6.8 3.6-8.8.2L.6 18.2c-2.2-3.8.9-8.5 5.3-8l60 7.4c.7.1 1.4.1 2.1 0l50.2-7.4c4.4-.6 7.6 4.2 5.4 8z"
    />
    <path fill="url(#vite-b)" d="M83.4 7.6L44 48.8l20.4 2.8-19.3 35.8 45.5-47.5-21-2.9 13.8-29.4z" />
    <defs>
      <linearGradient id="vite-a" x1="1.7" y1="10.8" x2="69.4" y2="124.6" gradientUnits="userSpaceOnUse">
        <stop stopColor="#41D1FF" />
        <stop offset="1" stopColor="#BD34FE" />
      </linearGradient>
      <linearGradient id="vite-b" x1="56.2" y1="13.5" x2="77.3" y2="82.4" gradientUnits="userSpaceOnUse">
        <stop stopColor="#FFEA83" />
        <stop offset=".08" stopColor="#FFDD35" />
        <stop offset="1" stopColor="#FFA800" />
      </linearGradient>
    </defs>
  </svg>
);

export const AstroLogo: FC<SVGProps<SVGSVGElement>> = (props) => (
  <svg viewBox="0 0 128 128" width="20" height="20" {...props}>
    <path
      fill="#FF5D01"
      d="M78.6 100.9c-4.2 5.5-10.4 9.1-17.7 9.8-3.9.4-7.8-.3-11.2-2.1 7.2-4.1 12.3-10.8 14.1-18.9 4 3.1 9.9 6.8 14.8 11.2z"
    />
    <path
      fill="#BC52EE"
      d="M63.8 89.7c-1.8 8.1-6.9 14.8-14.1 18.9-7-3.7-12.2-10.2-13.8-18.2 8.7 1.8 19.3.9 27.9-.7z"
    />
    <path
      fill="#0F172A"
      d="M87.5 24.3C72.8 14.5 54.8 16.3 43.1 28c-11.3 11.3-13.5 28.5-6.5 43.6l10-10c-3-9.5-1-19.9 5.8-26.7 8.3-8.3 21-8.3 29.3 0l5.8-10.6z"
    />
    <path
      fill="#2563EB"
      d="M91.4 34.9l-5.8 10.6c3.1 3.1 4.9 7.3 4.9 11.8 0 9.2-7.5 16.7-16.7 16.7-3.4 0-6.6-1-9.2-2.8L54.7 81c5.2 3.6 11.4 5.7 18.1 5.7 17.5 0 31.7-14.2 31.7-31.7 0-7.7-2.7-14.7-7.1-20.1z"
    />
  </svg>
);

export const JavaLogo: FC<SVGProps<SVGSVGElement>> = (props) => (
  <svg viewBox="0 0 128 128" width="20" height="20" {...props}>
    <path
      fill="#5382A1"
      d="M47.7 97.4c-8.9 1.4-13.2 5.8-1.5 7.8 28.4 4.8 54.2 1.3 54.2-7.3 0-5.7-15.6-7.8-24.9-6.4 5.3-2 12.7-1.4 18.4 1.4 16.7 8.2-17.7 11.7-38.3 8.3-8.6-1.5-13.2-3.1-7.9-3.8z"
    />
    <path
      fill="#E76F00"
      d="M57.6 60.5c5.3 4.9 9.1 10.8 4.2 18.2-7.4 11-20.9 9.3-31.4 6 5.6 2.3 13.9 3.8 20.3 2.5 13.9-2.9 20.7-14.7 12.1-22.7-2-1.9-4.2-3.3-5.2-4z"
    />
    <path
      fill="#E76F00"
      d="M72.5 40.2c-4 5.8-8.8 11.8-6.1 19.3 4.1 11.5 16.8 14.6 25.6 15.6-5.8-2.6-12.8-5.3-15.3-9.9-4.7-8.6 3.1-15.7 6.4-21.7 2.1-3.8 3.5-7.7 2.3-11.4-3.5 1.5-9.6 3.9-12.9 8.1z"
    />
  </svg>
);

export const PhpLogo: FC<SVGProps<SVGSVGElement>> = (props) => (
  <svg viewBox="0 0 128 128" width="22" height="22" {...props}>
    <ellipse cx="64" cy="64" rx="60" ry="34" fill="#777BB4" />
    <path
      fill="#FFFFFF"
      d="M38.5 73.6l4-18.7h11.2c3.7 0 6.3.7 7.7 2.2 1.4 1.5 1.7 3.6 1 6.6-.7 3.2-2.1 5.5-4.2 6.9-2.1 1.4-5.3 2.1-9.5 2.1l-2.2.9h-8zm7.3-6.5h3.6c2.4 0 4.1-.4 5-1.1s1.5-1.8 1.9-3.3c.4-1.5.2-2.5-.4-3.1s-1.8-.8-3.6-.8h-4.3l-2.2 8.3zm20.8 6.5l8-37.4h6.8l-8 37.4h-6.8zm17.6 0l4-18.7h11.2c3.7 0 6.3.7 7.7 2.2 1.4 1.5 1.7 3.6 1 6.6-.7 3.2-2.1 5.5-4.2 6.9-2.1 1.4-5.3 2.1-9.5 2.1l-2.2.9h-8zm7.3-6.5h3.6c2.4 0 4.1-.4 5-1.1s1.5-1.8 1.9-3.3c.4-1.5.2-2.5-.4-3.1s-1.8-.8-3.6-.8h-4.3l-2.2 8.3z"
    />
  </svg>
);

export const RubyLogo: FC<SVGProps<SVGSVGElement>> = (props) => (
  <svg viewBox="0 0 128 128" width="20" height="20" {...props}>
    <path fill="#CC342D" d="M12.8 95.3l38.4 30.2 49-6.3 24.8-59.5-38.3-43.1L26.3 35.1l-13.5 60.2z" />
    <path fill="#E6534B" d="M86.7 16.6l38.3 43.1-24.8 59.5L86.7 16.6z" />
    <path fill="#FFF" opacity=".3" d="M26.3 35.1l60.4-18.5L50 63.8 26.3 35.1z" />
    <path fill="#B22222" d="M51.2 125.5l49-6.3-48-55.4-1 61.7z" />
  </svg>
);

export const ALL_TECH_STACK: TechItem[] = [
  { id: "nextjs", name: "Next.js", category: "Frontend", Icon: NextJsLogo },
  { id: "react", name: "React", category: "Frontend", Icon: ReactLogo },
  { id: "typescript", name: "TypeScript", category: "Frontend", Icon: TypeScriptLogo },
  { id: "nodejs", name: "Node.js", category: "Backend", Icon: NodeJsLogo },
  { id: "python", name: "Python", category: "Backend", Icon: PythonLogo },
  { id: "golang", name: "Go", category: "Backend", Icon: GoLogo },
  { id: "rust", name: "Rust", category: "Backend", Icon: RustLogo },
  { id: "docker", name: "Docker", category: "DevOps", Icon: DockerLogo },
  { id: "postgres", name: "PostgreSQL", category: "Database", Icon: PostgresLogo },
  { id: "redis", name: "Redis", category: "Database", Icon: RedisLogo },
  { id: "vite", name: "Vite", category: "Frontend", Icon: ViteLogo },
  { id: "astro", name: "Astro", category: "Frontend", Icon: AstroLogo },
  { id: "java", name: "Java", category: "Backend", Icon: JavaLogo },
  { id: "php", name: "PHP", category: "Backend", Icon: PhpLogo },
  { id: "ruby", name: "Ruby", category: "Backend", Icon: RubyLogo },
];
