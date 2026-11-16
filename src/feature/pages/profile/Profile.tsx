import React from "react";
import {
  Alert,
  Avatar,
  Box,
  Button,
  Card,
  Chip,
  CircularProgress,
  Divider,
  IconButton,
  InputLabel,
  MenuItem,
  Select,
  Slider,
  Stack,
  Switch,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { useNavigate, useSearchParams } from "react-router-dom";
import PhotoCameraOutlinedIcon from "@mui/icons-material/PhotoCameraOutlined";
import AddIcon from "@mui/icons-material/Add";
import LogoutIcon from "@mui/icons-material/Logout";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import VerifiedIcon from "@mui/icons-material/Verified";
import ConfirmDialog from "../../../components/ConfirmDialog";
import { useAuth } from "../../../context/AuthContext";
import { useToast } from "../../../context/ToastContext";
import { ApiError, api, uploadFile } from "../../../lib/api";
import type { User } from "../../../lib/types";

const GENDERS = [
  { value: "", label: "Prefer not to say" },
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
  { value: "other", label: "Other" },
];

function toDateInput(value?: string | null): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

export default function Profile() {
  const { user, updateUser, logout } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const welcome = params.get("welcome") === "1";

  const [name, setName] = React.useState(user?.name || "");
  const [username, setUsername] = React.useState(user?.username || "");
  const [bio, setBio] = React.useState(user?.bio || "");
  const [occupation, setOccupation] = React.useState(user?.occupation || "");
  const [gender, setGender] = React.useState(user?.gender || "");
  const [birthdate, setBirthdate] = React.useState(toDateInput(user?.birthdate));
  const [interests, setInterests] = React.useState<string[]>(user?.interests || []);
  const [languages, setLanguages] = React.useState<string[]>(user?.languages || []);
  const [interestDraft, setInterestDraft] = React.useState("");
  const [languageDraft, setLanguageDraft] = React.useState("");

  const [discoverable, setDiscoverable] = React.useState(user?.privacy?.discoverable !== false);
  const [showAge, setShowAge] = React.useState(user?.privacy?.showAge !== false);
  const [showDistance, setShowDistance] = React.useState(user?.privacy?.showDistance !== false);
  const [showOnline, setShowOnline] = React.useState(user?.privacy?.showOnline !== false);
  const [messagesFrom, setMessagesFrom] = React.useState<"friends" | "everyone">(
    user?.privacy?.messagesFrom || "friends"
  );
  const [genderPreference, setGenderPreference] = React.useState<"male" | "female" | "all">(
    user?.discovery?.genderPreference || "all"
  );
  const [maxDistance, setMaxDistance] = React.useState(user?.discovery?.maxDistanceKm || 25);
  const [ageRange, setAgeRange] = React.useState<[number, number]>([
    user?.discovery?.ageMin || 18,
    user?.discovery?.ageMax || 60,
  ]);

  const [saving, setSaving] = React.useState(false);
  const [uploading, setUploading] = React.useState<"avatar" | "cover" | null>(null);
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);
  const avatarInput = React.useRef<HTMLInputElement | null>(null);
  const coverInput = React.useRef<HTMLInputElement | null>(null);

  React.useEffect(() => {
    if (!user) return;
    setName(user.name || "");
    setUsername(user.username || "");
    setBio(user.bio || "");
    setOccupation(user.occupation || "");
    setGender(user.gender || "");
    setBirthdate(toDateInput(user.birthdate));
    setInterests(user.interests || []);
    setLanguages(user.languages || []);
    setDiscoverable(user.privacy?.discoverable !== false);
    setShowAge(user.privacy?.showAge !== false);
    setShowDistance(user.privacy?.showDistance !== false);
    setShowOnline(user.privacy?.showOnline !== false);
    setMessagesFrom(user.privacy?.messagesFrom || "friends");
    setGenderPreference(user.discovery?.genderPreference || "all");
    setMaxDistance(user.discovery?.maxDistanceKm || 25);
    setAgeRange([user.discovery?.ageMin || 18, user.discovery?.ageMax || 60]);
  }, [user?._id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function save() {
    setSaving(true);
    try {
      const patch: Partial<User> = {
        name: name.trim(),
        username: username.trim() || undefined,
        bio,
        occupation,
        interests,
        languages,
        gender: (gender || undefined) as User["gender"],
        birthdate: birthdate ? new Date(birthdate).toISOString() : undefined,
        privacy: {
          discoverable,
          showAge,
          showDistance,
          showOnline,
          messagesFrom,
        },
        discovery: {
          genderPreference,
          maxDistanceKm: maxDistance,
          ageMin: ageRange[0],
          ageMax: ageRange[1],
        },
      };
      await updateUser(patch);
      toast.success("Profile updated");
      if (welcome) navigate("/discover", { replace: true });
    } catch (e) {
      toast.error((e as ApiError).message || "Could not save your profile.");
    } finally {
      setSaving(false);
    }
  }

  async function uploadImage(file: File, kind: "avatar" | "cover") {
    setUploading(kind);
    try {
      const uploaded = await uploadFile(file, { kind: "image", name: file.name });
      await updateUser(kind === "avatar" ? { avatarUrl: uploaded.url } : { coverUrl: uploaded.url });
      toast.success(kind === "avatar" ? "Profile photo updated" : "Cover photo updated");
    } catch (e) {
      toast.error((e as ApiError).message || "Could not upload that image.");
    } finally {
      setUploading(null);
    }
  }

  async function deleteAccount() {
    if (!user) return;
    setDeleting(true);
    try {
      await api(`/users/${user._id || user.id}`, { method: "DELETE" });
      logout();
      navigate("/login", { replace: true });
      toast.info("Your account has been deactivated.");
    } catch (e) {
      toast.error((e as ApiError).message || "Could not delete your account.");
    } finally {
      setDeleting(false);
      setConfirmDelete(false);
    }
  }

  function addTag(value: string, list: string[], setList: (v: string[]) => void, max: number) {
    const tag = value.trim();
    if (!tag) return;
    if (list.some((item) => item.toLowerCase() === tag.toLowerCase())) return;
    setList([...list, tag].slice(0, max));
  }

  return (
    <Box sx={{ height: "100%", overflowY: "auto", pb: 6 }}>
      {welcome && (
        <Alert severity="success" sx={{ m: 2, borderRadius: 3 }}>
          Welcome to ChatEasy! Add a photo and a short bio so people nearby can get to know you.
        </Alert>
      )}

      <Box
        sx={{
          height: { xs: 150, sm: 200 },
          position: "relative",
          background: user?.coverUrl
            ? `center/cover no-repeat url(${user.coverUrl})`
            : "linear-gradient(135deg,#0f9d76,#38bdf8)",
        }}
      >
        <input
          ref={coverInput}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => e.target.files?.[0] && uploadImage(e.target.files[0], "cover")}
        />
        <Button
          size="small"
          variant="contained"
          startIcon={uploading === "cover" ? <CircularProgress size={14} color="inherit" /> : <PhotoCameraOutlinedIcon />}
          onClick={() => coverInput.current?.click()}
          sx={{ position: "absolute", bottom: 12, right: 12, bgcolor: "rgba(0,0,0,0.45)", color: "#fff" }}
        >
          Cover
        </Button>
      </Box>

      <Box sx={{ px: { xs: 2, sm: 3 }, mt: { xs: -5, sm: -6 } }}>
        <Stack direction={{ xs: "column", sm: "row" }} spacing={2} alignItems={{ xs: "flex-start", sm: "flex-end" }}>
          <Box sx={{ position: "relative" }}>
            <input
              ref={avatarInput}
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => e.target.files?.[0] && uploadImage(e.target.files[0], "avatar")}
            />
            <Avatar
              src={user?.avatarUrl || undefined}
              sx={{ width: 108, height: 108, border: "4px solid", borderColor: "background.default", bgcolor: "primary.main", fontSize: 34 }}
            >
              {user?.name?.[0]}
            </Avatar>
            <Tooltip title="Change photo">
              <IconButton
                onClick={() => avatarInput.current?.click()}
                aria-label="Change profile photo"
                sx={{ position: "absolute", bottom: 2, right: 2, bgcolor: "background.paper", border: "1px solid", borderColor: "divider" }}
              >
                {uploading === "avatar" ? <CircularProgress size={18} /> : <PhotoCameraOutlinedIcon fontSize="small" />}
              </IconButton>
            </Tooltip>
          </Box>
          <Box sx={{ flex: 1, pb: 0.5 }}>
            <Stack direction="row" spacing={1} alignItems="center">
              <Typography variant="h5">{user?.name || "Your profile"}</Typography>
              {user?.verified && <VerifiedIcon color="primary" fontSize="small" />}
            </Stack>
            <Typography variant="body2" color="text.secondary">
              {user?.username ? `@${user.username}` : "Choose a username below"}
              {user?.age ? ` · ${user.age} years` : ""}
            </Typography>
          </Box>
          <Button variant="contained" onClick={save} disabled={saving} sx={{ mb: 0.5 }}>
            {saving ? "Saving…" : "Save changes"}
          </Button>
        </Stack>

        <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", lg: "1fr 1fr" }, mt: 3 }}>
          <Card sx={{ p: 2.5 }}>
            <Typography variant="h6" sx={{ mb: 2 }}>
              About you
            </Typography>
            <Stack spacing={2}>
              <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                <TextField label="Full name" value={name} onChange={(e) => setName(e.target.value)} fullWidth />
                <TextField
                  label="Username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, ""))}
                  fullWidth
                  helperText="Letters and numbers only"
                />
              </Stack>
              <TextField
                label="Bio"
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                fullWidth
                multiline
                minRows={3}
                inputProps={{ maxLength: 500 }}
                helperText={`${bio.length}/500`}
              />
              <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                <TextField
                  label="Occupation (optional)"
                  value={occupation}
                  onChange={(e) => setOccupation(e.target.value)}
                  fullWidth
                />
                <TextField
                  label="Date of birth"
                  type="date"
                  value={birthdate}
                  onChange={(e) => setBirthdate(e.target.value)}
                  fullWidth
                  InputLabelProps={{ shrink: true }}
                  helperText="Must be 18 or older"
                />
              </Stack>
              <Box>
                <InputLabel sx={{ mb: 0.5, fontSize: 12 }}>Gender</InputLabel>
                <Select value={gender} onChange={(e) => setGender(e.target.value)} fullWidth displayEmpty size="small">
                  {GENDERS.map((option) => (
                    <MenuItem key={option.value} value={option.value}>
                      {option.label}
                    </MenuItem>
                  ))}
                </Select>
              </Box>

              <Box>
                <Typography variant="subtitle2" sx={{ mb: 1 }}>
                  Interests
                </Typography>
                <Stack direction="row" spacing={0.5} sx={{ flexWrap: "wrap", gap: 0.5, mb: 1 }}>
                  {interests.map((interest) => (
                    <Chip key={interest} label={interest} onDelete={() => setInterests(interests.filter((i) => i !== interest))} />
                  ))}
                </Stack>
                <Stack direction="row" spacing={1}>
                  <TextField
                    size="small"
                    placeholder="Add an interest"
                    value={interestDraft}
                    onChange={(e) => setInterestDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addTag(interestDraft, interests, setInterests, 12);
                        setInterestDraft("");
                      }
                    }}
                  />
                  <Button
                    onClick={() => {
                      addTag(interestDraft, interests, setInterests, 12);
                      setInterestDraft("");
                    }}
                    startIcon={<AddIcon />}
                  >
                    Add
                  </Button>
                </Stack>
              </Box>

              <Box>
                <Typography variant="subtitle2" sx={{ mb: 1 }}>
                  Languages
                </Typography>
                <Stack direction="row" spacing={0.5} sx={{ flexWrap: "wrap", gap: 0.5, mb: 1 }}>
                  {languages.map((language) => (
                    <Chip key={language} label={language} onDelete={() => setLanguages(languages.filter((l) => l !== language))} />
                  ))}
                </Stack>
                <Stack direction="row" spacing={1}>
                  <TextField
                    size="small"
                    placeholder="Add a language"
                    value={languageDraft}
                    onChange={(e) => setLanguageDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addTag(languageDraft, languages, setLanguages, 8);
                        setLanguageDraft("");
                      }
                    }}
                  />
                  <Button
                    onClick={() => {
                      addTag(languageDraft, languages, setLanguages, 8);
                      setLanguageDraft("");
                    }}
                    startIcon={<AddIcon />}
                  >
                    Add
                  </Button>
                </Stack>
              </Box>
            </Stack>
          </Card>

          <Stack spacing={2}>
            <Card sx={{ p: 2.5 }}>
              <Typography variant="h6" sx={{ mb: 1 }}>
                Privacy
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Control what other people can see and who can start a conversation.
              </Typography>
              <Stack spacing={0.5}>
                <ToggleRow
                  title="Show me in Discover"
                  description="When off, your profile is hidden from nearby discovery."
                  checked={discoverable}
                  onChange={setDiscoverable}
                />
                <ToggleRow title="Show my age" description="Age appears on your profile and cards." checked={showAge} onChange={setShowAge} />
                <ToggleRow
                  title="Show approximate distance"
                  description="Others see a rounded distance, never your location."
                  checked={showDistance}
                  onChange={setShowDistance}
                />
                <ToggleRow title="Show when I'm online" description="Friends always see your presence." checked={showOnline} onChange={setShowOnline} />
                <Divider sx={{ my: 1 }} />
                <Box>
                  <InputLabel sx={{ mb: 0.5, fontSize: 12 }}>Who can message me</InputLabel>
                  <Select
                    value={messagesFrom}
                    onChange={(e) => setMessagesFrom(e.target.value as "friends" | "everyone")}
                    fullWidth
                    size="small"
                  >
                    <MenuItem value="friends">Only my friends</MenuItem>
                    <MenuItem value="everyone">Anyone (still requires a chat request)</MenuItem>
                  </Select>
                </Box>
              </Stack>
            </Card>

            <Card sx={{ p: 2.5 }}>
              <Typography variant="h6" sx={{ mb: 1 }}>
                Discovery preferences
              </Typography>
              <Stack spacing={2}>
                <Box>
                  <Typography variant="subtitle2" sx={{ mb: 1 }}>
                    Show me
                  </Typography>
                  <Stack direction="row" spacing={1}>
                    {(["all", "female", "male"] as const).map((value) => (
                      <Chip
                        key={value}
                        label={value === "all" ? "Everyone" : value === "female" ? "Women" : "Men"}
                        color={genderPreference === value ? "primary" : "default"}
                        variant={genderPreference === value ? "filled" : "outlined"}
                        onClick={() => setGenderPreference(value)}
                      />
                    ))}
                  </Stack>
                </Box>
                <Box>
                  <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
                    Maximum distance · {maxDistance} km
                  </Typography>
                  <Slider
                    value={maxDistance}
                    onChange={(_, value) => setMaxDistance(value as number)}
                    min={1}
                    max={100}
                    step={1}
                    valueLabelDisplay="auto"
                    marks={[
                      { value: 1, label: "1" },
                      { value: 25, label: "25" },
                      { value: 50, label: "50" },
                      { value: 100, label: "100" },
                    ]}
                  />
                </Box>
                <Box>
                  <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
                    Age range · {ageRange[0]}–{ageRange[1]}
                  </Typography>
                  <Slider
                    value={ageRange}
                    onChange={(_, value) => setAgeRange(value as [number, number])}
                    min={18}
                    max={90}
                    disableSwap
                    valueLabelDisplay="auto"
                  />
                </Box>
              </Stack>
            </Card>

            <Card sx={{ p: 2.5 }}>
              <Typography variant="h6" sx={{ mb: 1 }}>
                Account
              </Typography>
              <Stack spacing={1.5}>
                <Stack direction="row" justifyContent="space-between">
                  <Typography variant="body2" color="text.secondary">
                    Email
                  </Typography>
                  <Typography variant="body2">{user?.email}</Typography>
                </Stack>
                <Stack direction="row" justifyContent="space-between">
                  <Typography variant="body2" color="text.secondary">
                    Status
                  </Typography>
                  <Chip
                    size="small"
                    color={user?.verified ? "success" : "warning"}
                    label={user?.verified ? "Email verified" : "Unverified"}
                    icon={user?.verified ? <VerifiedIcon /> : undefined}
                  />
                </Stack>
                <Divider />
                <Button variant="outlined" startIcon={<LogoutIcon />} onClick={() => { logout(); navigate("/login"); }}>
                  Sign out
                </Button>
                <Button color="error" variant="text" startIcon={<DeleteOutlineIcon />} onClick={() => setConfirmDelete(true)}>
                  Deactivate my account
                </Button>
              </Stack>
            </Card>
          </Stack>
        </Box>
      </Box>

      <ConfirmDialog
        open={confirmDelete}
        title="Deactivate your account?"
        description="Your profile is removed from discovery and you are signed out. Contact support to restore it."
        confirmLabel="Deactivate"
        danger
        loading={deleting}
        onConfirm={deleteAccount}
        onClose={() => setConfirmDelete(false)}
      />
    </Box>
  );
}

function ToggleRow({
  title,
  description,
  checked,
  onChange,
}: {
  title: string;
  description: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={2} sx={{ py: 0.75 }}>
      <Box>
        <Typography variant="body2" sx={{ fontWeight: 600 }}>
          {title}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {description}
        </Typography>
      </Box>
      <Switch checked={checked} onChange={(e) => onChange(e.target.checked)} inputProps={{ "aria-label": title }} />
    </Stack>
  );
}

