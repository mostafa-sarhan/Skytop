export interface BrandMarkProps {
  size?: 'default' | 'lg' | 'sm';
  label?: string;
}

export const BrandMark = ({ size = 'default', label = 'Sky Top Travel' }: BrandMarkProps) => (
  <span className={`brand-mark ${size}`}>
    <img src="/sky-top-logo.png" alt={label} width={400} height={325} />
  </span>
);
