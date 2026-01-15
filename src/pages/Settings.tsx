import { useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme, colorThemes, boardSingleColors, colorfulPresets, stockStatusColorOptions, defaultStockStatusColors } from "@/contexts/ThemeContext";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, User, Building2, Moon, Sun, Palette, Check, LayoutGrid, RotateCcw, Package } from "lucide-react";

type ColorTheme = keyof typeof colorThemes;
type BoardSingleColor = keyof typeof boardSingleColors;
type ColorfulPreset = keyof typeof colorfulPresets;

const Settings = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useAuth();
  const { theme, colorTheme, boardColorMode, boardSingleColor, colorfulPreset, customBoardColor, stockStatusColors, toggleTheme, setTheme, setColorTheme, setBoardColorMode, setBoardSingleColor, setColorfulPreset, setCustomBoardColor, setStockStatusColors } = useTheme();
  const [userProfile, setUserProfile] = useState<any>(null);
  const [companyInfo, setCompanyInfo] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [previewTheme, setPreviewTheme] = useState<ColorTheme | null>(null);
  const [previewBoardColor, setPreviewBoardColor] = useState<BoardSingleColor | null>(null);
  const [previewColorfulPreset, setPreviewColorfulPreset] = useState<ColorfulPreset | null>(null);

  useEffect(() => {
    if (user) {
      fetchUserData();
    }
  }, [user]);

  const fetchUserData = async () => {
    if (!user) return;
    
    try {
      const { data: profileData } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();
      
      setUserProfile(profileData);

      if (profileData?.company_code) {
        const { data: companyData } = await supabase
          .from('companies')
          .select('*')
          .eq('code', profileData.company_code)
          .single();
        
        setCompanyInfo(companyData);
      }
    } catch (error) {
      console.error('Error fetching user data:', error);
      toast({
        title: "Error",
        description: "Failed to load user information",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleColorThemeSelect = (themeKey: ColorTheme) => {
    setColorTheme(themeKey);
    setPreviewTheme(null);
    toast({
      title: "Theme Updated",
      description: `Color theme changed to ${colorThemes[themeKey].name}`,
    });
  };

  const handleResetToDefaults = () => {
    setTheme('light');
    setColorTheme('purple');
    setBoardColorMode('colorful');
    setBoardSingleColor('primary');
    setColorfulPreset('default');
    setCustomBoardColor('#6366f1');
    setStockStatusColors(defaultStockStatusColors);
    toast({
      title: "Settings Reset",
      description: "All theme preferences have been restored to defaults",
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-lg">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-card border-b border-border shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <div className="flex items-center">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => navigate(-1)}
                className="mr-4"
              >
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <h1 className="text-2xl font-bold text-foreground">Settings</h1>
            </div>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          <div className="grid gap-6 md:grid-cols-2">
            {/* Appearance Settings */}
            <Card className="md:col-span-2">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Palette className="h-5 w-5 text-primary" />
                    <CardTitle>Appearance</CardTitle>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleResetToDefaults}
                    className="text-xs"
                  >
                    <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                    Reset Defaults
                  </Button>
                </div>
                <CardDescription>
                  Customize your viewing experience with themes and colors
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Dark Mode Toggle */}
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="theme-toggle" className="flex items-center gap-2">
                      {theme === 'dark' ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
                      Dark Mode
                    </Label>
                    <p className="text-sm text-muted-foreground">
                      Switch between light and dark themes
                    </p>
                  </div>
                  <Switch
                    id="theme-toggle"
                    checked={theme === 'dark'}
                    onCheckedChange={toggleTheme}
                  />
                </div>

                {/* Color Theme Selection */}
                <div className="space-y-3">
                  <Label>Color Theme</Label>
                  <p className="text-sm text-muted-foreground">
                    Choose a color theme for the app. Hover to preview.
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                    {(Object.entries(colorThemes) as [ColorTheme, typeof colorThemes[ColorTheme]][]).map(([key, themeConfig]) => {
                      const isSelected = colorTheme === key;
                      const isPreview = previewTheme === key;
                      
                      return (
                        <button
                          key={key}
                          onClick={() => handleColorThemeSelect(key)}
                          onMouseEnter={() => setPreviewTheme(key)}
                          onMouseLeave={() => setPreviewTheme(null)}
                          className={`
                            relative flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all duration-200
                            ${isSelected 
                              ? 'border-primary bg-accent shadow-md' 
                              : 'border-border hover:border-primary/50 hover:bg-muted/50'
                            }
                          `}
                        >
                          {/* Color Preview Circle */}
                          <div
                            className="w-10 h-10 rounded-full shadow-inner ring-2 ring-white/20"
                            style={{ backgroundColor: themeConfig.preview }}
                          />
                          
                          {/* Theme Name */}
                          <span className="text-xs font-medium text-foreground">
                            {themeConfig.name}
                          </span>

                          {/* Selected Indicator */}
                          {isSelected && (
                            <div 
                              className="absolute top-2 right-2 w-5 h-5 rounded-full flex items-center justify-center"
                              style={{ backgroundColor: themeConfig.preview }}
                            >
                              <Check className="h-3 w-3 text-white" />
                            </div>
                          )}

                          {/* Preview Badge */}
                          {isPreview && !isSelected && (
                            <div className="absolute -top-2 left-1/2 -translate-x-1/2 px-2 py-0.5 bg-foreground text-background text-[10px] font-medium rounded-full">
                              Preview
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Live Preview */}
                <div className="space-y-3 pt-4 border-t border-border">
                  <Label>Live Preview</Label>
                  <div className="p-4 rounded-xl bg-muted/30 border border-border space-y-3">
                    <div className="flex items-center gap-3">
                      <Button size="sm">Primary Button</Button>
                      <Button size="sm" variant="secondary">Secondary</Button>
                      <Button size="sm" variant="outline">Outline</Button>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-primary" />
                      <span className="text-sm text-primary font-medium">Primary text color</span>
                    </div>
                    <div className="p-3 rounded-lg bg-accent">
                      <span className="text-sm text-accent-foreground">Accent background preview</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Order Board Colors */}
            <Card className="md:col-span-2">
              <CardHeader>
                <div className="flex items-center space-x-2">
                  <LayoutGrid className="h-5 w-5 text-primary" />
                  <CardTitle>Order Board Colors</CardTitle>
                </div>
                <CardDescription>
                  Customize the column header colors on the orders board
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Color Mode Selection */}
                <div className="space-y-3">
                  <Label>Header Style</Label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      onClick={() => setBoardColorMode('colorful')}
                      className={`
                        relative flex flex-col items-center gap-3 p-4 rounded-xl border-2 transition-all duration-200
                        ${boardColorMode === 'colorful' 
                          ? 'border-primary bg-accent shadow-md' 
                          : 'border-border hover:border-primary/50 hover:bg-muted/50'
                        }
                      `}
                    >
                      <div className="flex gap-1">
                        {colorfulPresets[colorfulPreset].colors.map((color, i) => (
                          <div key={i} className={`w-6 h-6 rounded ${color}`} />
                        ))}
                      </div>
                      <span className="text-sm font-medium">Colorful</span>
                      <span className="text-xs text-muted-foreground">Each column has a unique color</span>
                      {boardColorMode === 'colorful' && (
                        <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                          <Check className="h-3 w-3 text-primary-foreground" />
                        </div>
                      )}
                    </button>

                    <button
                      onClick={() => setBoardColorMode('single')}
                      className={`
                        relative flex flex-col items-center gap-3 p-4 rounded-xl border-2 transition-all duration-200
                        ${boardColorMode === 'single' 
                          ? 'border-primary bg-accent shadow-md' 
                          : 'border-border hover:border-primary/50 hover:bg-muted/50'
                        }
                      `}
                    >
                      <div className="flex gap-1">
                        {[0, 1, 2, 3].map((i) => (
                          <div 
                            key={i} 
                            className={`w-6 h-6 rounded ${boardSingleColor !== 'custom' ? boardSingleColors[boardSingleColor]?.bgClass : ''}`}
                            style={boardSingleColor === 'custom' ? { backgroundColor: customBoardColor } : undefined}
                          />
                        ))}
                      </div>
                      <span className="text-sm font-medium">Single Color</span>
                      <span className="text-xs text-muted-foreground">All columns use one color</span>
                      {boardColorMode === 'single' && (
                        <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                          <Check className="h-3 w-3 text-primary-foreground" />
                        </div>
                      )}
                    </button>
                  </div>
                </div>

                {/* Colorful Presets (only show when colorful mode is active) */}
                {boardColorMode === 'colorful' && (
                  <div className="space-y-3">
                    <Label>Color Palette</Label>
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                      {(Object.entries(colorfulPresets) as [ColorfulPreset, typeof colorfulPresets[ColorfulPreset]][]).map(([key, config]) => {
                        const isSelected = colorfulPreset === key;
                        const isPreview = previewColorfulPreset === key;
                        
                        return (
                          <button
                            key={key}
                            onClick={() => {
                              setColorfulPreset(key);
                              setPreviewColorfulPreset(null);
                              toast({
                                title: "Board Palette Updated",
                                description: `Color palette changed to ${config.name}`,
                              });
                            }}
                            onMouseEnter={() => setPreviewColorfulPreset(key)}
                            onMouseLeave={() => setPreviewColorfulPreset(null)}
                            className={`
                              relative flex flex-col items-center gap-2 p-3 rounded-xl border-2 transition-all duration-200
                              ${isSelected 
                                ? 'border-primary bg-accent shadow-md' 
                                : 'border-border hover:border-primary/50 hover:bg-muted/50'
                              }
                            `}
                          >
                            <div className="flex gap-1">
                              {config.colors.map((color, i) => (
                                <div key={i} className={`w-5 h-5 rounded ${color}`} />
                              ))}
                            </div>
                            <span className="text-xs font-medium text-foreground">
                              {config.name}
                            </span>
                            {isSelected && (
                              <div className="absolute top-1 right-1 w-4 h-4 rounded-full bg-primary flex items-center justify-center">
                                <Check className="h-2.5 w-2.5 text-primary-foreground" />
                              </div>
                            )}
                            {isPreview && !isSelected && (
                              <div className="absolute -top-2 left-1/2 -translate-x-1/2 px-2 py-0.5 bg-foreground text-background text-[10px] font-medium rounded-full">
                                Preview
                              </div>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Single Color Selection (only show when single mode is active) */}
                {boardColorMode === 'single' && (
                  <div className="space-y-4">
                    <div className="space-y-3">
                      <Label>Preset Colors</Label>
                      <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                        {(Object.entries(boardSingleColors) as [BoardSingleColor, typeof boardSingleColors[BoardSingleColor]][])
                          .filter(([key]) => key !== 'custom')
                          .map(([key, config]) => {
                          const isSelected = boardSingleColor === key;
                          const isPreview = previewBoardColor === key;
                          
                          return (
                            <button
                              key={key}
                              onClick={() => {
                                setBoardSingleColor(key);
                                setPreviewBoardColor(null);
                                toast({
                                  title: "Board Color Updated",
                                  description: `Column color changed to ${config.name}`,
                                });
                              }}
                              onMouseEnter={() => setPreviewBoardColor(key)}
                              onMouseLeave={() => setPreviewBoardColor(null)}
                              className={`
                                relative flex flex-col items-center gap-2 p-2.5 rounded-xl border-2 transition-all duration-200
                                ${isSelected 
                                  ? 'border-primary bg-accent shadow-md' 
                                  : 'border-border hover:border-primary/50 hover:bg-muted/50'
                                }
                              `}
                            >
                              <div
                                className={`w-7 h-7 rounded-lg shadow-inner ${config.bgClass}`}
                              />
                              <span className="text-[10px] font-medium text-foreground">
                                {config.name}
                              </span>
                              {isSelected && (
                                <div 
                                  className={`absolute top-1 right-1 w-3.5 h-3.5 rounded-full flex items-center justify-center ${config.bgClass}`}
                                >
                                  <Check className={`h-2 w-2 ${config.textClass}`} />
                                </div>
                              )}
                              {isPreview && !isSelected && (
                                <div className="absolute -top-2 left-1/2 -translate-x-1/2 px-1.5 py-0.5 bg-foreground text-background text-[9px] font-medium rounded-full">
                                  Preview
                                </div>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Custom Color Picker */}
                    <div className="space-y-3 pt-3 border-t border-border">
                      <Label>Custom Color</Label>
                      <div className="flex items-center gap-4">
                        <button
                          onClick={() => {
                            setBoardSingleColor('custom');
                            toast({
                              title: "Custom Color Selected",
                              description: "Use the color picker to choose your color",
                            });
                          }}
                          className={`
                            relative flex items-center gap-3 p-3 rounded-xl border-2 transition-all duration-200 flex-1
                            ${boardSingleColor === 'custom' 
                              ? 'border-primary bg-accent shadow-md' 
                              : 'border-border hover:border-primary/50 hover:bg-muted/50'
                            }
                          `}
                        >
                          <div 
                            className="w-10 h-10 rounded-lg shadow-inner border border-border"
                            style={{ backgroundColor: customBoardColor }}
                          />
                          <div className="flex flex-col items-start">
                            <span className="text-sm font-medium text-foreground">Custom Color</span>
                            <span className="text-xs text-muted-foreground uppercase">{customBoardColor}</span>
                          </div>
                          {boardSingleColor === 'custom' && (
                            <div 
                              className="absolute top-2 right-2 w-4 h-4 rounded-full flex items-center justify-center"
                              style={{ backgroundColor: customBoardColor }}
                            >
                              <Check className="h-2.5 w-2.5 text-white" />
                            </div>
                          )}
                        </button>
                        <div className="flex flex-col gap-2">
                          <Input
                            type="color"
                            value={customBoardColor}
                            onChange={(e) => {
                              setCustomBoardColor(e.target.value);
                              if (boardSingleColor !== 'custom') {
                                setBoardSingleColor('custom');
                              }
                            }}
                            className="w-14 h-14 p-1 rounded-xl cursor-pointer border-2 border-border"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Board Preview */}
                <div className="space-y-3 pt-4 border-t border-border">
                  <Label>Board Preview</Label>
                  <div className="p-4 rounded-xl bg-muted/30 border border-border">
                    <div className="grid grid-cols-4 gap-2">
                      {['Awaiting', 'In Stock', 'In Progress', 'Ready'].map((label, index) => {
                        const presetColors = colorfulPresets[colorfulPreset]?.colors || colorfulPresets.default.colors;
                        const presetTextColors = colorfulPresets[colorfulPreset]?.textColors || colorfulPresets.default.textColors;
                        
                        let bgColor = '';
                        let textColor = '';
                        let customStyle: React.CSSProperties | undefined;
                        
                        if (boardColorMode === 'colorful') {
                          bgColor = presetColors[index];
                          textColor = presetTextColors[index];
                        } else if (boardSingleColor === 'custom') {
                          textColor = 'text-white';
                          customStyle = { backgroundColor: customBoardColor };
                        } else {
                          bgColor = boardSingleColors[boardSingleColor]?.bgClass || 'bg-primary';
                          textColor = boardSingleColors[boardSingleColor]?.textClass || 'text-primary-foreground';
                        }
                        
                        return (
                          <div 
                            key={label}
                            className={`${bgColor} ${textColor} px-2 py-1.5 rounded-lg text-center text-xs font-medium`}
                            style={customStyle}
                          >
                            {label}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Stock Status Checkbox Colors */}
            <Card className="md:col-span-2">
              <CardHeader>
                <div className="flex items-center space-x-2">
                  <Package className="h-5 w-5 text-primary" />
                  <CardTitle>Stock Status Checkbox Colors</CardTitle>
                </div>
                <CardDescription>
                  Customize the colors of the Ordered (O) and Received (R) checkboxes and their labels
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Ordered Color */}
                <div className="space-y-3">
                  <Label className="flex items-center gap-2">
                    <div 
                      className="w-4 h-4 rounded-sm" 
                      style={{ backgroundColor: stockStatusColors.orderedColor }}
                    />
                    Ordered (O) Color
                  </Label>
                  <div className="grid grid-cols-5 sm:grid-cols-10 gap-2">
                    {stockStatusColorOptions.map((colorOption) => {
                      const isSelected = stockStatusColors.orderedColor === colorOption.value;
                      return (
                        <button
                          key={colorOption.value}
                          onClick={() => {
                            setStockStatusColors({
                              ...stockStatusColors,
                              orderedColor: colorOption.value
                            });
                            toast({
                              title: "Color Updated",
                              description: `Ordered checkbox color changed to ${colorOption.name}`,
                            });
                          }}
                          className={`
                            relative w-10 h-10 rounded-lg transition-all duration-200 flex items-center justify-center
                            ${isSelected 
                              ? 'ring-2 ring-offset-2 ring-primary' 
                              : 'hover:scale-110'
                            }
                          `}
                          style={{ backgroundColor: colorOption.value }}
                          title={colorOption.name}
                        >
                          {isSelected && (
                            <Check className="h-4 w-4 text-white drop-shadow-md" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Received Color */}
                <div className="space-y-3">
                  <Label className="flex items-center gap-2">
                    <div 
                      className="w-4 h-4 rounded-sm" 
                      style={{ backgroundColor: stockStatusColors.receivedColor }}
                    />
                    Received (R) Color
                  </Label>
                  <div className="grid grid-cols-5 sm:grid-cols-10 gap-2">
                    {stockStatusColorOptions.map((colorOption) => {
                      const isSelected = stockStatusColors.receivedColor === colorOption.value;
                      return (
                        <button
                          key={colorOption.value}
                          onClick={() => {
                            setStockStatusColors({
                              ...stockStatusColors,
                              receivedColor: colorOption.value
                            });
                            toast({
                              title: "Color Updated",
                              description: `Received checkbox color changed to ${colorOption.name}`,
                            });
                          }}
                          className={`
                            relative w-10 h-10 rounded-lg transition-all duration-200 flex items-center justify-center
                            ${isSelected 
                              ? 'ring-2 ring-offset-2 ring-primary' 
                              : 'hover:scale-110'
                            }
                          `}
                          style={{ backgroundColor: colorOption.value }}
                          title={colorOption.name}
                        >
                          {isSelected && (
                            <Check className="h-4 w-4 text-white drop-shadow-md" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Preview */}
                <div className="space-y-3 pt-4 border-t border-border">
                  <Label>Preview</Label>
                  <div className="p-4 rounded-xl bg-muted/30 border border-border">
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-2">
                        <div 
                          className="w-4 h-4 rounded-sm border-2" 
                          style={{ 
                            backgroundColor: stockStatusColors.orderedColor,
                            borderColor: stockStatusColors.orderedColor 
                          }}
                        />
                        <span 
                          className="text-sm font-medium"
                          style={{ color: stockStatusColors.orderedColor }}
                        >
                          O (Ordered)
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div 
                          className="w-4 h-4 rounded-sm border-2" 
                          style={{ 
                            backgroundColor: stockStatusColors.receivedColor,
                            borderColor: stockStatusColors.receivedColor 
                          }}
                        />
                        <span 
                          className="text-sm font-medium"
                          style={{ color: stockStatusColors.receivedColor }}
                        >
                          R (Received)
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Profile Information */}
            <Card>
              <CardHeader>
                <div className="flex items-center space-x-2">
                  <User className="h-5 w-5 text-primary" />
                  <CardTitle>Profile Information</CardTitle>
                </div>
                <CardDescription>
                  Your personal account information
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="fullName">Full Name</Label>
                  <Input
                    id="fullName"
                    value={userProfile?.full_name || ''}
                    readOnly
                    className="bg-muted"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    value={userProfile?.email || user?.email || ''}
                    readOnly
                    className="bg-muted"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">Phone</Label>
                  <Input
                    id="phone"
                    value={userProfile?.phone || 'Not provided'}
                    readOnly
                    className="bg-muted"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="position">Position</Label>
                  <Input
                    id="position"
                    value={userProfile?.position || 'Not provided'}
                    readOnly
                    className="bg-muted"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="companyCode">Company Code</Label>
                  <Input
                    id="companyCode"
                    value={userProfile?.company_code || 'Not provided'}
                    readOnly
                    className="bg-muted"
                  />
                </div>
              </CardContent>
            </Card>

            {/* Company Information */}
            <Card>
              <CardHeader>
                <div className="flex items-center space-x-2">
                  <Building2 className="h-5 w-5 text-primary" />
                  <CardTitle>Company Information</CardTitle>
                </div>
                <CardDescription>
                  Information about your company
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {companyInfo ? (
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="companyName">Company Name</Label>
                      <Input
                        id="companyName"
                        value={companyInfo.name}
                        readOnly
                        className="bg-muted"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="contactPerson">Contact Person</Label>
                      <Input
                        id="contactPerson"
                        value={companyInfo.contact_person || 'Not provided'}
                        readOnly
                        className="bg-muted"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="companyEmail">Company Email</Label>
                      <Input
                        id="companyEmail"
                        value={companyInfo.email || 'Not provided'}
                        readOnly
                        className="bg-muted"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="companyPhone">Company Phone</Label>
                      <Input
                        id="companyPhone"
                        value={companyInfo.phone || 'Not provided'}
                        readOnly
                        className="bg-muted"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="companyAddress">Address</Label>
                      <Input
                        id="companyAddress"
                        value={companyInfo.address || 'Not provided'}
                        readOnly
                        className="bg-muted"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="vatNumber">VAT Number</Label>
                      <Input
                        id="vatNumber"
                        value={companyInfo.vat_number || 'Not provided'}
                        readOnly
                        className="bg-muted"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="accountManager">Account Manager</Label>
                      <Input
                        id="accountManager"
                        value={companyInfo.account_manager || 'Not provided'}
                        readOnly
                        className="bg-muted"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <Building2 className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                    <p className="text-muted-foreground">No company information available</p>
                    <p className="text-sm text-muted-foreground mt-2">
                      Company details will appear here once linked to a company code
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Settings;
