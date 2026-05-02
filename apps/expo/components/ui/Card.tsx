import { Surface, type SurfaceProps } from './app-primitives';

interface CardProps extends SurfaceProps {}

export function Card({ children, style, ...props }: CardProps) {
  return (
    <Surface tone="default" padding="md" style={style} {...props}>
      {children}
    </Surface>
  );
}
