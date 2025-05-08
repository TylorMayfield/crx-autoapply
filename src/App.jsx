import { useState, useEffect } from "react";
import {
  MantineProvider,
  AppShell,
  Text,
  Button,
  Group,
  Stack,
  Card,
  Box,
  ActionIcon,
  useMantineColorScheme,
  ColorSchemeProvider,
  TextInput,
  LoadingOverlay,
  Accordion,
  List,
  ThemeIcon,
  Switch,
} from "@mantine/core";
import { useColorScheme } from "@mantine/hooks";
import { Notifications, notifications } from "@mantine/notifications";
import { IconSun, IconMoon, IconBrandGithub, IconBrandChrome, IconCheck, IconRocket } from "@tabler/icons-react";
import "./App.css";

function App() {
  const preferredColorScheme = useColorScheme();
  const { colorScheme, toggleColorScheme } = useMantineColorScheme({
    defaultValue: preferredColorScheme,
  });
  const dark = colorScheme === "dark";
  const [userData, setUserData] = useState({});
  const [successfulApps, setSuccessfulApps] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [saveTimeout, setSaveTimeout] = useState(null);
  const [isAutoRunning, setIsAutoRunning] = useState(false);

  useEffect(() => {
    // Load saved user data and successful applications
    chrome.storage.local.get(["userData", "successfulApps", "isAutoRunning"], (result) => {
      setUserData(result.userData || {});
      setSuccessfulApps(result.successfulApps || []);
      setIsAutoRunning(result.isAutoRunning || false);
      setIsLoading(false);
    });
  }, []);

  const handleSaveData = (field, value) => {
    const newUserData = { ...userData, [field]: value };
    setUserData(newUserData);
    
    // Clear any existing timeout
    if (saveTimeout) {
      clearTimeout(saveTimeout);
    }
    
    // Set a new timeout to save data and show notification
    const timeoutId = setTimeout(() => {
      chrome.storage.local.set({ userData: newUserData });
      notifications.show({
        title: "Saved!",
        message: `Your ${field} has been updated`,
        color: "green",
      });
    }, 1000); // Wait 1 second after last keystroke before saving
    
    setSaveTimeout(timeoutId);
  };

  // Cleanup timeout on component unmount
  useEffect(() => {
    return () => {
      if (saveTimeout) {
        clearTimeout(saveTimeout);
      }
    };
  }, [saveTimeout]);

  const clearAllData = () => {
    setUserData({});
    setSuccessfulApps([]);
    chrome.storage.local.remove(["userData", "successfulApps"]);
    notifications.show({
      title: "Cleared",
      message: "All saved data has been cleared",
      color: "blue",
    });
  };

  const toggleAutoRunner = (enabled) => {
    setIsAutoRunning(enabled);
    chrome.storage.local.set({ isAutoRunning: enabled });
    
    // Send message to content script
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        console.log('[App] Sending toggle message to tab:', tabs[0].id);
        chrome.tabs.sendMessage(tabs[0].id, { 
          type: 'TOGGLE_AUTO_RUNNER',
          enabled: enabled
        }, (response) => {
          if (chrome.runtime.lastError) {
            console.error('[App] Error sending message:', chrome.runtime.lastError);
            notifications.show({
              title: "Error",
              message: "Please make sure you're on LinkedIn and refresh the page",
              color: "red",
            });
            return;
          }
          console.log('[App] Toggle response:', response);
        });
      } else {
        console.log('[App] No active tab found');
        notifications.show({
          title: "Error",
          message: "Please open LinkedIn in your browser",
          color: "red",
        });
        return;
      }
    });

    notifications.show({
      title: enabled ? "Auto-Runner Enabled" : "Auto-Runner Disabled",
      message: enabled ? "The extension will now automatically apply to LinkedIn Easy Apply jobs" : "Auto-running has been stopped",
      color: enabled ? "green" : "blue",
    });
  };

  function Footer() {
    return (
      <footer
        style={{
          marginTop: "auto",
          padding: "10px",
          textAlign: "center",
        }}
      >
        <Group align="center" justify="center" spacing="sm">
          <Text
            size="sm"
            style={{ display: "inline-flex", alignItems: "center" }}
          >
            <a
              href="https://github.com/TylorMayfield/crx-template"
              target="_blank"
              rel="noopener noreferrer"
              style={{ marginRight: "10px" }}
            >
              <IconBrandGithub />
            </a>
            <a
              href="https://chromewebstore.google.com/detail/chrome-extension-template/mechhnlbchididihbgadhfokjnbhfbed"
              target="_blank"
              rel="noopener noreferrer"
            >
              <IconBrandChrome />
            </a>
          </Text>
        </Group>
      </footer>
    );
  }

  return (
    <MantineProvider
      theme={{
        colorScheme,
      }}
      withGlobalStyles
      withNormalizeCSS
    >
      <Box
        style={{
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          minWidth: "400px",
        }}
      >
        <Notifications position="top-center" />
        <LoadingOverlay visible={isLoading} />

        <AppShell padding="md" style={{ minHeight: "100vh" }}>
          <Stack spacing="lg">
            <Card shadow="sm" p="lg" radius="md" withBorder>
              <Group position="apart" mb="md">
                <Text size="xl" weight={500}>
                  Job Auto Apply
                </Text>
                <Group>
                  <Switch
                    checked={isAutoRunning}
                    onChange={(event) => toggleAutoRunner(event.currentTarget.checked)}
                    size="md"
                    color="green"
                    label={
                      <Group spacing="xs">
                        <IconRocket size={16} />
                        <Text size="sm">Auto-Runner</Text>
                      </Group>
                    }
                  />
                  <ActionIcon
                    variant="outline"
                    color={dark ? "yellow" : "blue"}
                    onClick={() => toggleColorScheme()}
                    title="Toggle color scheme"
                  >
                    {dark ? <IconSun size={18} /> : <IconMoon size={18} />}
                  </ActionIcon>
                </Group>
              </Group>

              <Group position="apart" mt="xl">
                <Button color="red" variant="light" onClick={clearAllData}>
                  Clear All Data
                </Button>
                <Text size="xs" color="dimmed">
                  Data is stored locally only
                </Text>
              </Group>
              <Footer />
            </Card>
          </Stack>
        </AppShell>
      </Box>
    </MantineProvider>
  );
}

export default App;
