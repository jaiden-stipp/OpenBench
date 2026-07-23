import rtlDeckLogoDark from '../assets/rtldeck-logo-dark.png';
import rtlDeckLogoLight from '../assets/rtldeck-logo.png';

type ThemeLogoProps = {
  className?: string;
};

export default function ThemeLogo({ className = '' }: ThemeLogoProps) {
  const sharedClassName = `theme-logo ${className}`.trim();

  return (
    <span className="theme-logo-pair" aria-hidden="true">
      <img className={`${sharedClassName} theme-logo-light`} src={rtlDeckLogoLight} alt="" />
      <img className={`${sharedClassName} theme-logo-dark`} src={rtlDeckLogoDark} alt="" />
    </span>
  );
}
