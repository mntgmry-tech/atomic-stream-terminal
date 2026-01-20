export interface Theme {
  name: string
  colors: {
    primary: string
    secondary: string
    success: string
    warning: string
    danger: string
    info: string
    background: string
    foreground: string
    border: string
    muted: string
  }
  chart: {
    line1: string
    line2: string
    line3: string
    line4: string
    baseline: string
  }
}

export const darkTheme: Theme = {
  name: "dark",
  colors: {
    primary: "cyan",
    secondary: "magenta",
    success: "green",
    warning: "yellow",
    danger: "red",
    info: "blue",
    background: "black",
    foreground: "white",
    border: "cyan",
    muted: "gray"
  },
  chart: {
    line1: "cyan",
    line2: "magenta",
    line3: "yellow",
    line4: "green",
    baseline: "gray"
  }
}

export const lightTheme: Theme = {
  name: "light",
  colors: {
    primary: "blue",
    secondary: "magenta",
    success: "green",
    warning: "#ff8800",
    danger: "red",
    info: "cyan",
    background: "white",
    foreground: "black",
    border: "blue",
    muted: "gray"
  },
  chart: {
    line1: "blue",
    line2: "magenta",
    line3: "#ff8800",
    line4: "green",
    baseline: "gray"
  }
}
