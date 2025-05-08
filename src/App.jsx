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

              <Accordion>
                <Accordion.Item value="personalInfo">
                  <Accordion.Control>Personal Information</Accordion.Control>
                  <Accordion.Panel>
                    <Stack spacing="sm">
                      <TextInput
                        label="Full Name"
                        value={userData.name || ""}
                        onChange={(e) => handleSaveData("name", e.target.value)}
                        placeholder="Enter your full name"
                      />
                      <Group grow>
                        <TextInput
                          label="First Name"
                          value={userData.firstName || ""}
                          onChange={(e) => handleSaveData("firstName", e.target.value)}
                          placeholder="Enter your first name"
                        />
                        <TextInput
                          label="Last Name"
                          value={userData.lastName || ""}
                          onChange={(e) => handleSaveData("lastName", e.target.value)}
                          placeholder="Enter your last name"
                        />
                      </Group>
                      <TextInput
                        label="Email"
                        value={userData.email || ""}
                        onChange={(e) => handleSaveData("email", e.target.value)}
                        placeholder="Enter your email"
                      />
                      <TextInput
                        label="Phone"
                        value={userData.phone || ""}
                        onChange={(e) => handleSaveData("phone", e.target.value)}
                        placeholder="Enter your phone number"
                      />
                      <TextInput
                        label="Location"
                        value={userData.location || ""}
                        onChange={(e) => handleSaveData("location", e.target.value)}
                        placeholder="City, State"
                      />
                    </Stack>
                  </Accordion.Panel>
                </Accordion.Item>

                <Accordion.Item value="experience">
                  <Accordion.Control>Experience & Education</Accordion.Control>
                  <Accordion.Panel>
                    <Stack spacing="sm">
                      <TextInput
                        label="Current Title"
                        value={userData.currentTitle || ""}
                        onChange={(e) => handleSaveData("currentTitle", e.target.value)}
                        placeholder="Your current job title"
                      />
                      <TextInput
                        label="Current Company"
                        value={userData.currentCompany || ""}
                        onChange={(e) => handleSaveData("currentCompany", e.target.value)}
                        placeholder="Your current company"
                      />
                      <TextInput
                        label="Years of Experience"
                        value={userData.yearsOfExperience || ""}
                        onChange={(e) => handleSaveData("yearsOfExperience", e.target.value)}
                        placeholder="Total years of experience"
                      />
                      <TextInput
                        label="Work Experience Summary"
                        value={userData.experience || ""}
                        onChange={(e) => handleSaveData("experience", e.target.value)}
                        placeholder="Brief summary of your experience"
                      />
                      <TextInput
                        label="Education"
                        value={userData.education || ""}
                        onChange={(e) => handleSaveData("education", e.target.value)}
                        placeholder="Your highest education"
                      />
                    </Stack>
                  </Accordion.Panel>
                </Accordion.Item>

                <Accordion.Item value="additional">
                  <Accordion.Control>Additional Information</Accordion.Control>
                  <Accordion.Panel>
                    <Stack spacing="sm">
                      <TextInput
                        label="LinkedIn Profile"
                        value={userData.linkedin || ""}
                        onChange={(e) => handleSaveData("linkedin", e.target.value)}
                        placeholder="Your LinkedIn profile URL"
                      />
                      <TextInput
                        label="Portfolio/Website"
                        value={userData.website || ""}
                        onChange={(e) => handleSaveData("website", e.target.value)}
                        placeholder="Your portfolio or website URL"
                      />
                      <TextInput
                        label="GitHub"
                        value={userData.github || ""}
                        onChange={(e) => handleSaveData("github", e.target.value)}
                        placeholder="Your GitHub profile URL"
                      />
                      <TextInput
                        label="Expected Salary"
                        value={userData.salaryExpectation || ""}
                        onChange={(e) => handleSaveData("salaryExpectation", e.target.value)}
                        placeholder="Your expected salary"
                      />
                      <TextInput
                        label="Notice Period"
                        value={userData.noticePeriod || ""}
                        onChange={(e) => handleSaveData("noticePeriod", e.target.value)}
                        placeholder="Your notice period"
                      />
                    </Stack>
                  </Accordion.Panel>
                </Accordion.Item>

                <Accordion.Item value="applications">
                  <Accordion.Control>Successful Applications ({successfulApps.length})</Accordion.Control>
                  <Accordion.Panel>
                    {successfulApps.length === 0 ? (
                      <Text color="dimmed" size="sm">No successful applications yet</Text>
                    ) : (
                      <List
                        spacing="xs"
                        size="sm"
                        center
                        icon={
                          <ThemeIcon color="teal" size={24} radius="xl">
                            <IconCheck size={16} />
                          </ThemeIcon>
                        }
                      >
                        {successfulApps.map((app, index) => (
                          <List.Item key={index}>
                            <Text size="sm">
                              {app.company} - {app.position}
                              <Text size="xs" color="dimmed">
                                {new Date(app.date).toLocaleDateString()} via {app.platform}
                              </Text>
                            </Text>
                          </List.Item>
                        ))}
                      </List>
                    )}
                  </Accordion.Panel>
                </Accordion.Item>
              </Accordion>

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
