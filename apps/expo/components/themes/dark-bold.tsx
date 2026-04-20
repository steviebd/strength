import { createContext, useContext, type ReactNode } from 'react';
import { View, Text as RNText } from 'react-native';

export interface ThemeColors {
  bg: string;
  card: string;
  border: string;
  text: string;
  muted: string;
  primary: string;
  secondary: string;
  accent: string;
}

export interface ThemeSpacing {
  xs: string;
  sm: string;
  md: string;
  lg: string;
  xl: string;
  xxl: string;
}

export interface ThemeBorderRadius {
  sm: string;
  md: string;
  lg: string;
  xl: string;
  full: string;
}

export interface ThemeTypography {
  fontWeights: {
    normal: string;
    medium: string;
    semibold: string;
    bold: string;
  };
  fontSizes: {
    xs: string;
    sm: string;
    base: string;
    lg: string;
    xl: string;
    xxl: string;
    xxxl: string;
  };
  lineHeights: {
    tight: string;
    normal: string;
    relaxed: string;
  };
}

export interface CardProps {
  children: ReactNode;
  className?: string;
}

export interface ButtonProps {
  children: ReactNode;
  variant?: 'primary' | 'secondary' | 'ghost';
  className?: string;
  onPress?: () => void;
  disabled?: boolean;
}

export interface TextProps {
  children: ReactNode;
  variant?: 'xs' | 'sm' | 'base' | 'lg' | 'xl' | 'xxl' | 'muted';
  className?: string;
}

export interface DarkBoldTheme {
  colors: ThemeColors;
  spacing: ThemeSpacing;
  borderRadius: ThemeBorderRadius;
  typography: ThemeTypography;
  Card: React.FC<CardProps>;
  Button: React.FC<ButtonProps>;
  Text: React.FC<TextProps>;
}

const colors: ThemeColors = {
  bg: '#0a0a0a',
  card: '#1a1a1a',
  border: '#2a2a2a',
  text: '#f5f5f5',
  muted: '#a0a0a0',
  primary: '#ef6f4f',
  secondary: '#1f4d3c',
  accent: '#ef6f4f',
};

const spacing: ThemeSpacing = {
  xs: '4',
  sm: '8',
  md: '16',
  lg: '24',
  xl: '32',
  xxl: '48',
};

const borderRadius: ThemeBorderRadius = {
  sm: 'rounded-sm',
  md: 'rounded-md',
  lg: 'rounded-lg',
  xl: 'rounded-xl',
  full: 'rounded-full',
};

const typography: ThemeTypography = {
  fontWeights: {
    normal: 'font-normal',
    medium: 'font-medium',
    semibold: 'font-semibold',
    bold: 'font-bold',
  },
  fontSizes: {
    xs: 'text-xs',
    sm: 'text-sm',
    base: 'text-base',
    lg: 'text-lg',
    xl: 'text-xl',
    xxl: 'text-2xl',
    xxxl: 'text-3xl',
  },
  lineHeights: {
    tight: 'leading-tight',
    normal: 'leading-normal',
    relaxed: 'leading-relaxed',
  },
};

const Card: React.FC<CardProps> = ({ children, className = '' }) => (
  <View className={`bg-darkCard border border-darkBorder rounded-xl p-4 ${className}`}>
    {children}
  </View>
);

const Button: React.FC<ButtonProps> = ({
  children,
  variant = 'primary',
  className = '',
  onPress,
  disabled,
}) => {
  const baseClasses = 'px-4 py-3 rounded-lg font-semibold transition-colors';
  const variantClasses = {
    primary: 'bg-coral text-white',
    secondary: 'bg-darkBorder text-darkText',
    ghost: 'bg-transparent text-darkText',
  };
  return (
    <View
      className={`${baseClasses} ${variantClasses[variant]} ${disabled ? 'opacity-50' : ''} ${className}`}
      onTouchEnd={onPress}
    >
      <RNText className="text-center">{children}</RNText>
    </View>
  );
};

const Text: React.FC<TextProps> = ({ children, variant = 'base', className = '' }) => {
  const variantClasses = {
    xs: 'text-xs text-darkMuted',
    sm: 'text-sm text-darkMuted',
    base: 'text-base text-darkText',
    lg: 'text-lg text-darkText',
    xl: 'text-xl text-darkText',
    xxl: 'text-2xl font-bold text-darkText',
    muted: 'text-base text-darkMuted',
  };
  return (
    <View className={className}>
      <RNText className={variantClasses[variant]}>{children}</RNText>
    </View>
  );
};

const ThemeContext = createContext<DarkBoldTheme | null>(null);

export function DarkBoldProvider({ children }: { children: ReactNode }) {
  const theme: DarkBoldTheme = {
    colors,
    spacing,
    borderRadius,
    typography,
    Card,
    Button,
    Text,
  };
  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}

export function useDarkBoldTheme(): DarkBoldTheme {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useDarkBoldTheme must be used within DarkBoldProvider');
  return context;
}

export const darkBoldTheme: DarkBoldTheme = {
  colors,
  spacing,
  borderRadius,
  typography,
  Card,
  Button,
  Text,
};
