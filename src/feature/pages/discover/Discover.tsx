import React from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  IconButton,
  Menu,
  MenuItem,
  Slider,
  Stack,
  Switch,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
  useMediaQuery,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { useNavigate } from "react-router-dom";
import MyLocationIcon from "@mui/icons-material/MyLocation";
import CloseIcon from "@mui/icons-material/Close";
import FavoriteIcon from "@mui/icons-material/Favorite";
import FavoriteBorderIcon from "@mui/icons-material/FavoriteBorder";
import PersonAddAltIcon from "@mui/icons-material/PersonAddAlt";
import TuneIcon from "@mui/icons-material/Tune";
import ViewListIcon from "@mui/icons-material/ViewList";
import StyleIcon from "@mui/icons-material/Style";
import FlagOutlinedIcon from "@mui/icons-material/FlagOutlined";
import BlockIcon from "@mui/icons-material/Block";
import ChatBubbleOutlineIcon from "@mui/icons-material/ChatBubbleOutline";
import ExploreOutlinedIcon from "@mui/icons-material/ExploreOutlined";
import MoreHorizIcon from "@mui/icons-material/MoreHoriz";
import UserAvatar from "../../../components/Avatar";
import EmptyState from "../../../components/EmptyState";
import { CardGridSkeleton, DiscoveryCardSkeleton } from "../../../components/Skeletons";
import { useAuth } from "../../../context/AuthContext";
import { useToast } from "../../../context/ToastContext";
import { ApiError, api } from "../../../lib/api";
import { formatRelative, presenceLabel } from "../../../lib/format";
import type { DiscoveryResponse, User } from "../../../lib/types";

const DISTANCES = [1, 5, 10, 25, 50, 100];

interface Filters {
  gender: "male" | "female" | "all";
  maxDistanceKm: number;
  age: [number, number];
  interests: string[];
  onlineOnly: boolean;
}

const DEFAULT_FILTERS: Filters = {
  gender: "all",
  maxDistanceKm: 25,
  age: [18, 60],
  interests: [],
  onlineOnly: false,
};

export default function Discover() {
  const theme = useTheme();
  const navigate = useNavigate();
  const { user } = useAuth();
  const toast = useToast();
  const meId = String(user?._id || user?.id || "");
  const isDesktop = useMediaQuery(theme.breakpoints.up("md"));

  const [mode, setMode] = React.useState<"swipe" | "list">(isDesktop ? "list" : "swipe");
  const [filters, setFilters] = React.useState<Filters>(DEFAULT_FILTERS);
  const [filtersOpen, setFiltersOpen] = React.useState(false);
  const [people, setPeople] = React.useState<User[]>([]);
  const [page, setPage] = React.useState(0);
  const [hasMore, setHasMore] = React.useState(false);
  const [hasLocation, setHasLocation] = React.useState<boolean | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [loadingMore, setLoadingMore] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [locating, setLocating] = React.useState(false);
  const [discoverable, setDiscoverable] = React.useState(true);
  const [match, setMatch] = React.useState<User | null>(null);
  const [detail, setDetail] = React.useState<User | null>(null);
  const [menuAnchor, setMenuAnchor] = React.useState<{ el: HTMLElement; person: User } | null>(null);
  const [interestDraft, setInterestDraft] = React.useState("");
  const [likesOnly, setLikesOnly] = React.useState(false);

  const fetchPeople = React.useCallback(
    async (nextPage: number, replace: boolean) => {
      if (nextPage === 0) setLoading(true);
      else setLoadingMore(true);
      setError(null);
      try {
        const data = await api<DiscoveryResponse>("/discovery", {
          query: {
            gender: filters.gender,
            minAge: filters.age[0],
            maxAge: filters.age[1],
            maxDistanceKm: filters.maxDistanceKm,
            interests: filters.interests.join(","),
            onlineOnly: filters.onlineOnly,
            page: nextPage,
            limit: 12,
          },
        });
        setHasLocation(!!data.hasLocation);
        setHasMore(!!data.hasMore);
        setPage(nextPage);
        setPeople((prev) => {
          const merged = replace ? data.results : [...prev, ...data.results];
          const seen = new Set<string>();
          return merged.filter((p) => {
            if (seen.has(p._id)) return false;
            seen.add(p._id);
            return true;
          });
        });
      } catch (e) {
        setError((e as ApiError).message || "Could not load nearby people.");
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [filters]
  );

  React.useEffect(() => {
    const timer = window.setTimeout(() => {
      void fetchPeople(0, true);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [fetchPeople]);

  React.useEffect(() => {
    api<{ discoverable: boolean; hasLocation: boolean }>("/discovery/preferences")
      .then((prefs) => {
        setDiscoverable(prefs.discoverable);
        setHasLocation(prefs.hasLocation);
      })
      .catch(() => undefined);
  }, []);

  async function enableLocation() {
    if (!navigator.geolocation) {
      toast.error("This browser cannot share your location.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          await api("/discovery/location", {
            method: "POST",
            body: { lat: position.coords.latitude, lng: position.coords.longitude },
          });
          setHasLocation(true);
          toast.success("Location shared — only an approximate area is stored.");
          void fetchPeople(0, true);
        } catch (e) {
          toast.error((e as ApiError).message || "Could not save your location.");
        } finally {
          setLocating(false);
        }
      },
      (geoError) => {
        setLocating(false);
        toast.error(
          geoError.code === geoError.PERMISSION_DENIED
            ? "Location permission denied. You can still browse without distance."
            : "Could not read your location right now."
        );
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 5 * 60 * 1000 }
    );
  }

  async function stopSharingLocation() {
    try {
      await api("/discovery/location", { method: "DELETE" });
      setHasLocation(false);
      toast.info("Location removed. Distance is hidden until you share it again.");
    } catch (e) {
      toast.error((e as ApiError).message || "Could not remove your location.");
    }
  }

  async function toggleDiscoverable(next: boolean) {
    setDiscoverable(next);
    try {
      await api("/discovery/preferences", { method: "PUT", body: { discoverable: next } });
      toast.success(next ? "You are visible in discovery" : "You are hidden from discovery");
    } catch (e) {
      setDiscoverable(!next);
      toast.error((e as ApiError).message || "Could not update visibility.");
    }
  }

  function removePerson(id: string) {
    setPeople((prev) => prev.filter((p) => p._id !== id));
  }

  async function like(person: User) {
    removePerson(person._id);
    try {
      const result = await api<{ match: boolean; user?: User }>("/discovery/like", {
        method: "POST",
        body: { userId: person._id },
      });
      if (result.match) setMatch(result.user || person);
    } catch (e) {
      toast.error((e as ApiError).message || "Could not send that like.");
    }
  }

  async function skip(person: User) {
    removePerson(person._id);
    try {
      await api("/discovery/skip", { method: "POST", body: { userId: person._id } });
    } catch {
      /* skipping is best-effort */
    }
  }

  async function sendRequest(person: User) {
    try {
      await api("/friends/request", { method: "POST", body: { toUserId: person._id } });
      toast.success(`Friend request sent to ${person.name}`);
    } catch (e) {
      toast.error((e as ApiError).message || "Could not send the request.");
    }
  }

  async function block(person: User) {
    try {
      await api(`/friends/block/${person._id}`, { method: "POST" });
      removePerson(person._id);
      toast.success(`${person.name} blocked`);
    } catch (e) {
      toast.error((e as ApiError).message || "Could not block this user.");
    } finally {
      setMenuAnchor(null);
    }
  }

  async function report(person: User) {
    try {
      await api("/friends/report", { method: "POST", body: { userId: person._id, reason: "other" } });
      toast.success("Report submitted for review.");
    } catch (e) {
      toast.error((e as ApiError).message || "Could not submit the report.");
    } finally {
      setMenuAnchor(null);
    }
  }

  async function openChat(person: User) {
    try {
      const chat = await api<{ _id: string }>("/chats", { method: "POST", body: { members: [meId, person._id] } });
      navigate(`/chats?chat=${chat._id}`);
    } catch (e) {
      toast.error((e as ApiError).message || "Could not open a chat with this person.");
    }
  }

  const current = people[0];

  return (
    <Box sx={{ height: "100%", overflowY: "auto", px: { xs: 2, sm: 3 }, py: 2.5 }}>
      <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" alignItems={{ xs: "stretch", sm: "center" }} spacing={2} sx={{ mb: 2 }}>
        <Box>
          <Typography variant="h5">Discover</Typography>
          <Typography variant="body2" color="text.secondary">
            People near you who share your interests. Distances are approximate.
          </Typography>
        </Box>
        <Stack direction="row" spacing={1} alignItems="center">
          <ToggleButtonGroup
            exclusive
            size="small"
            value={mode}
            onChange={(_, value) => value && setMode(value)}
            aria-label="Discovery layout"
          >
            <ToggleButton value="swipe" aria-label="Swipe view">
              <StyleIcon fontSize="small" />
            </ToggleButton>
            <ToggleButton value="list" aria-label="List view">
              <ViewListIcon fontSize="small" />
            </ToggleButton>
          </ToggleButtonGroup>
          <Button
            variant={filtersOpen ? "contained" : "outlined"}
            size="small"
            startIcon={<TuneIcon />}
            onClick={() => setFiltersOpen((v) => !v)}
          >
            Filters
          </Button>
        </Stack>
      </Stack>

      <Stack direction="row" spacing={1} sx={{ mb: 2, flexWrap: "wrap", gap: 1 }}>
        <Chip
          icon={<MyLocationIcon />}
          label={hasLocation ? "Location on" : "Location off"}
          color={hasLocation ? "primary" : "default"}
          variant={hasLocation ? "filled" : "outlined"}
          onClick={hasLocation ? stopSharingLocation : enableLocation}
          disabled={locating}
          deleteIcon={hasLocation ? <CloseIcon /> : undefined}
          onDelete={hasLocation ? stopSharingLocation : undefined}
        />
        <Chip
          label={discoverable ? "Visible to others" : "Hidden from discovery"}
          color={discoverable ? "success" : "default"}
          variant={discoverable ? "outlined" : "filled"}
          onClick={() => toggleDiscoverable(!discoverable)}
        />
        <Chip
          label="People who liked you"
          variant={likesOnly ? "filled" : "outlined"}
          color={likesOnly ? "secondary" : "default"}
          onClick={() => setLikesOnly((v) => !v)}
        />
      </Stack>

      {filtersOpen && (
        <Card sx={{ p: 2.5, mb: 2.5 }}>
          <Stack spacing={2.5}>
            <Box>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>
                Show me
              </Typography>
              <Stack direction="row" spacing={1}>
                {(["all", "female", "male"] as const).map((value) => (
                  <Chip
                    key={value}
                    label={value === "all" ? "Everyone" : value === "female" ? "Women" : "Men"}
                    color={filters.gender === value ? "primary" : "default"}
                    variant={filters.gender === value ? "filled" : "outlined"}
                    onClick={() => setFilters({ ...filters, gender: value })}
                  />
                ))}
              </Stack>
            </Box>

            <Box>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>
                Distance · up to {filters.maxDistanceKm} km
              </Typography>
              <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", gap: 1 }}>
                {DISTANCES.map((value) => (
                  <Chip
                    key={value}
                    label={`${value} km`}
                    color={filters.maxDistanceKm === value ? "primary" : "default"}
                    variant={filters.maxDistanceKm === value ? "filled" : "outlined"}
                    onClick={() => setFilters({ ...filters, maxDistanceKm: value })}
                  />
                ))}
              </Stack>
            </Box>

            <Box>
              <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
                Age · {filters.age[0]}–{filters.age[1]}
              </Typography>
              <Slider
                value={filters.age}
                onChange={(_, value) => setFilters({ ...filters, age: value as [number, number] })}
                valueLabelDisplay="auto"
                min={18}
                max={90}
                disableSwap
                sx={{ maxWidth: 380 }}
              />
            </Box>

            <Box>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>
                Interests
              </Typography>
              <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", gap: 1, mb: 1 }}>
                {filters.interests.map((interest) => (
                  <Chip
                    key={interest}
                    label={interest}
                    onDelete={() =>
                      setFilters({ ...filters, interests: filters.interests.filter((i) => i !== interest) })
                    }
                  />
                ))}
              </Stack>
              <Stack direction="row" spacing={1}>
                <TextField
                  size="small"
                  placeholder="e.g. hiking"
                  value={interestDraft}
                  onChange={(e) => setInterestDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && interestDraft.trim()) {
                      e.preventDefault();
                      setFilters({
                        ...filters,
                        interests: [...new Set([...filters.interests, interestDraft.trim()])].slice(0, 6),
                      });
                      setInterestDraft("");
                    }
                  }}
                />
                <Button
                  onClick={() => {
                    if (!interestDraft.trim()) return;
                    setFilters({
                      ...filters,
                      interests: [...new Set([...filters.interests, interestDraft.trim()])].slice(0, 6),
                    });
                    setInterestDraft("");
                  }}
                >
                  Add
                </Button>
              </Stack>
            </Box>

            <Stack direction="row" alignItems="center" justifyContent="space-between">
              <Typography variant="subtitle2">Online now only</Typography>
              <Switch
                checked={filters.onlineOnly}
                onChange={(e) => setFilters({ ...filters, onlineOnly: e.target.checked })}
              />
            </Stack>

            <Stack direction="row" justifyContent="flex-end">
              <Button onClick={() => setFilters(DEFAULT_FILTERS)} color="inherit">
                Reset filters
              </Button>
            </Stack>
          </Stack>
        </Card>
      )}

      {hasLocation === false && (
        <Card sx={{ p: 2.5, mb: 2.5, display: "flex", gap: 2, alignItems: "flex-start", flexWrap: "wrap" }}>
          <Box sx={{ p: 1.25, borderRadius: 3, bgcolor: "action.hover", display: "grid", placeItems: "center" }}>
            <MyLocationIcon color="primary" />
          </Box>
          <Box sx={{ flex: 1, minWidth: 220 }}>
            <Typography sx={{ fontWeight: 650 }}>Share an approximate location to see distances</Typography>
            <Typography variant="body2" color="text.secondary">
              We round your position to roughly a 1 km area before storing it, so nobody can see your
              address. You can turn this off at any time.
            </Typography>
          </Box>
          <Button variant="contained" onClick={enableLocation} disabled={locating} startIcon={locating ? <CircularProgress size={16} /> : <MyLocationIcon />}>
            {locating ? "Locating…" : "Enable nearby"}
          </Button>
        </Card>
      )}

      {error && (
        <Alert severity="error" sx={{ mb: 2, borderRadius: 3 }} action={<Button onClick={() => fetchPeople(0, true)}>Retry</Button>}>
          {error}
        </Alert>
      )}

      {likesOnly ? (
        <LikesPanel
          onLike={like}
          onRequest={sendRequest}
          onOpen={(person) => setDetail(person)}
          onDismiss={(person) => void skip(person)}
        />
      ) : loading ? (
        mode === "list" ? (
          <CardGridSkeleton />
        ) : (
          <Box sx={{ maxWidth: 460, mx: "auto" }}>
            <DiscoveryCardSkeleton />
          </Box>
        )
      ) : people.length === 0 ? (
        <EmptyState
          icon={ExploreOutlinedIcon}
          title="No one to show right now"
          description="Try widening the distance, age range or interests — new people appear as they join nearby."
          actionLabel="Reset filters"
          onAction={() => setFilters(DEFAULT_FILTERS)}
        />
      ) : mode === "list" ? (
        <>
          <Box
            sx={{
              display: "grid",
              gap: 2,
              gridTemplateColumns: { xs: "1fr", sm: "repeat(2, 1fr)", lg: "repeat(3, 1fr)" },
            }}
          >
            {people.map((person) => (
              <PersonCard
                key={person._id}
                person={person}
                onLike={() => like(person)}
                onSkip={() => skip(person)}
                onRequest={() => sendRequest(person)}
                onOpen={() => setDetail(person)}
                onMenu={(el) => setMenuAnchor({ el, person })}
              />
            ))}
          </Box>
          {hasMore && (
            <Box sx={{ display: "flex", justifyContent: "center", mt: 3 }}>
              <Button variant="outlined" onClick={() => fetchPeople(page + 1, false)} disabled={loadingMore}>
                {loadingMore ? "Loading…" : "Load more people"}
              </Button>
            </Box>
          )}
        </>
      ) : (
        <SwipeDeck
          person={current}
          onLike={() => like(current)}
          onSkip={() => skip(current)}
          onRequest={() => sendRequest(current)}
          onOpen={() => setDetail(current)}
          onMenu={(el) => setMenuAnchor({ el, person: current })}
          onLoadMore={() => hasMore && fetchPeople(page + 1, false)}
          loadingMore={loadingMore}
          hasMore={hasMore}
        />
      )}

      <Menu anchorEl={menuAnchor?.el} open={!!menuAnchor} onClose={() => setMenuAnchor(null)}>
        <MenuItem onClick={() => menuAnchor && report(menuAnchor.person)}>
          <FlagOutlinedIcon fontSize="small" sx={{ mr: 1 }} /> Report
        </MenuItem>
        <MenuItem sx={{ color: "error.main" }} onClick={() => menuAnchor && block(menuAnchor.person)}>
          <BlockIcon fontSize="small" sx={{ mr: 1 }} /> Block
        </MenuItem>
      </Menu>

      <ProfileDialog
        person={detail}
        onClose={() => setDetail(null)}
        onLike={(p) => {
          setDetail(null);
          void like(p);
        }}
        onRequest={(p) => sendRequest(p)}
        onChat={(p) => openChat(p)}
      />

      <Dialog open={!!match} onClose={() => setMatch(null)} maxWidth="xs" fullWidth>
        <DialogContent sx={{ textAlign: "center", py: 4 }}>
          <Typography variant="h4" sx={{ mb: 1 }}>
            It's a match! 🎉
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            You and {match?.name} liked each other. Send a friend request to start chatting.
          </Typography>
          <UserAvatar src={match?.avatarUrl} name={match?.name} size={96} sx={{ mx: "auto", mb: 3 }} />
          <Stack direction="row" spacing={1.5}>
            <Button
              variant="outlined"
              fullWidth
              onClick={() => {
                setMatch(null);
              }}
            >
              Keep browsing
            </Button>
            <Button
              variant="contained"
              fullWidth
              onClick={() => {
                if (match) void sendRequest(match);
                setMatch(null);
              }}
            >
              Add friend
            </Button>
          </Stack>
        </DialogContent>
      </Dialog>
    </Box>
  );
}

/* ------------------------------- components ------------------------------- */

function PersonCard({
  person,
  onLike,
  onSkip,
  onRequest,
  onOpen,
  onMenu,
}: {
  person: User;
  onLike: () => void;
  onSkip: () => void;
  onRequest: () => void;
  onOpen: () => void;
  onMenu?: (el: HTMLElement) => void;
}) {
  return (
    <Card sx={{ overflow: "hidden", display: "flex", flexDirection: "column" }}>
      <Box
        sx={{
          height: 170,
          background: person.avatarUrl
            ? `center/cover no-repeat url(${person.avatarUrl})`
            : "linear-gradient(135deg,#0f9d76,#38bdf8)",
          position: "relative",
          cursor: "pointer",
        }}
        onClick={onOpen}
      >
        {!person.avatarUrl && (
          <Box sx={{ position: "absolute", inset: 0, display: "grid", placeItems: "center" }}>
            <UserAvatar name={person.name} size={78} sx={{ border: "3px solid rgba(255,255,255,0.5)" }} />
          </Box>
        )}
        {onMenu && (
          <IconButton
            size="small"
            onClick={(e) => {
              e.stopPropagation();
              onMenu(e.currentTarget);
            }}
            sx={{ position: "absolute", top: 8, right: 8, bgcolor: "rgba(0,0,0,0.35)", color: "#fff" }}
            aria-label="More options"
          >
            <MoreHorizIcon fontSize="small" />
          </IconButton>
        )}
        {person.isOnline && (
          <Chip
            label="Online"
            size="small"
            sx={{ position: "absolute", top: 10, left: 10, bgcolor: "rgba(34,197,94,0.9)", color: "#06281a", fontWeight: 700 }}
          />
        )}
      </Box>
      <Box sx={{ p: 2, display: "flex", flexDirection: "column", gap: 1, flex: 1 }}>
        <Stack direction="row" alignItems="baseline" spacing={1}>
          <Typography sx={{ fontWeight: 700 }} noWrap>
            {person.name}
          </Typography>
          {person.age ? (
            <Typography variant="body2" color="text.secondary">
              {person.age}
            </Typography>
          ) : null}
        </Stack>
        <Typography variant="caption" color="text.secondary">
          {person.distanceLabel || presenceLabel(person.isOnline, person.lastActiveAt)}
        </Typography>
        {person.bio && (
          <Typography variant="body2" color="text.secondary" sx={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
            {person.bio}
          </Typography>
        )}
        {!!person.interests?.length && (
          <Stack direction="row" spacing={0.5} sx={{ flexWrap: "wrap", gap: 0.5 }}>
            {person.interests.slice(0, 3).map((interest) => (
              <Chip key={interest} label={interest} size="small" />
            ))}
          </Stack>
        )}
        <Stack direction="row" spacing={1} sx={{ mt: "auto", pt: 1 }}>
          <Button size="small" variant="outlined" onClick={onSkip} startIcon={<CloseIcon />} sx={{ flex: 1 }}>
            Skip
          </Button>
          <Button size="small" variant="outlined" color="primary" onClick={onRequest} startIcon={<PersonAddAltIcon />} sx={{ flex: 1 }}>
            Add
          </Button>
          <Button size="small" variant="contained" onClick={onLike} startIcon={<FavoriteIcon />} sx={{ flex: 1 }}>
            Like
          </Button>
        </Stack>
      </Box>
    </Card>
  );
}

function SwipeDeck({
  person,
  onLike,
  onSkip,
  onRequest,
  onOpen,
  onMenu,
  onLoadMore,
  loadingMore,
  hasMore,
}: {
  person: User;
  onLike: () => void;
  onSkip: () => void;
  onRequest: () => void;
  onOpen: () => void;
  onMenu: (el: HTMLElement) => void;
  onLoadMore: () => void;
  loadingMore: boolean;
  hasMore: boolean;
}) {
  const [drag, setDrag] = React.useState({ x: 0, y: 0, active: false });
  const startRef = React.useRef({ x: 0, y: 0 });

  function endDrag() {
    const { x } = drag;
    setDrag({ x: 0, y: 0, active: false });
    if (x > 110) onLike();
    else if (x < -110) onSkip();
  }

  return (
    <Box sx={{ maxWidth: 460, mx: "auto" }}>
      <Card
        onPointerDown={(e) => {
          startRef.current = { x: e.clientX, y: e.clientY };
          setDrag({ x: 0, y: 0, active: true });
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (!drag.active) return;
          setDrag({ x: e.clientX - startRef.current.x, y: e.clientY - startRef.current.y, active: true });
        }}
        onPointerUp={endDrag}
        onPointerCancel={() => setDrag({ x: 0, y: 0, active: false })}
        sx={{
          overflow: "hidden",
          touchAction: "pan-y",
          transform: `translate(${drag.x}px, ${drag.y}px) rotate(${drag.x / 26}deg)`,
          transition: drag.active ? "none" : "transform 220ms cubic-bezier(0.2,0.8,0.2,1)",
          position: "relative",
          cursor: drag.active ? "grabbing" : "grab",
          userSelect: "none",
        }}
      >
        <Box
          sx={{
            height: { xs: 300, sm: 330 },
            background: person.avatarUrl
              ? `center/cover no-repeat url(${person.avatarUrl})`
              : "linear-gradient(135deg,#0f9d76,#38bdf8)",
            position: "relative",
          }}
        >
          {!person.avatarUrl && (
            <Box sx={{ position: "absolute", inset: 0, display: "grid", placeItems: "center" }}>
              <UserAvatar name={person.name} size={104} />
            </Box>
          )}
          <Box
            sx={{
              position: "absolute",
              inset: 0,
              background: "linear-gradient(180deg, rgba(0,0,0,0) 45%, rgba(0,0,0,0.78) 100%)",
            }}
          />
          <IconButton
            size="small"
            onClick={(e) => {
              e.stopPropagation();
              onMenu(e.currentTarget);
            }}
            sx={{ position: "absolute", top: 10, right: 10, bgcolor: "rgba(0,0,0,0.4)", color: "#fff" }}
            aria-label="More options"
          >
            <MoreHorizIcon fontSize="small" />
          </IconButton>
          <Box sx={{ position: "absolute", left: 16, right: 16, bottom: 14, color: "#fff" }}>
            <Stack direction="row" alignItems="baseline" spacing={1}>
              <Typography variant="h5" sx={{ color: "#fff" }}>
                {person.name}
              </Typography>
              {person.age ? <Typography sx={{ color: "rgba(255,255,255,0.85)" }}>{person.age}</Typography> : null}
            </Stack>
            <Typography variant="caption" sx={{ color: "rgba(255,255,255,0.85)" }}>
              {[person.distanceLabel || "Nearby", person.isOnline ? "Online" : presenceLabel(false, person.lastActiveAt)]
                .filter(Boolean)
                .join(" · ")}
            </Typography>
          </Box>
          {Math.abs(drag.x) > 45 && (
            <Box
              sx={{
                position: "absolute",
                top: 24,
                left: drag.x > 0 ? 20 : "auto",
                right: drag.x < 0 ? 20 : "auto",
                border: "3px solid",
                borderColor: drag.x > 0 ? "#22c55e" : "#ef4444",
                color: drag.x > 0 ? "#22c55e" : "#ef4444",
                borderRadius: 2,
                px: 1.5,
                py: 0.5,
                fontWeight: 800,
                transform: "rotate(-10deg)",
                bgcolor: "rgba(0,0,0,0.25)",
              }}
            >
              {drag.x > 0 ? "LIKE" : "SKIP"}
            </Box>
          )}
        </Box>

        <Box sx={{ p: 2 }}>
          {person.bio && (
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              {person.bio}
            </Typography>
          )}
          {!!person.interests?.length && (
            <Stack direction="row" spacing={0.5} sx={{ flexWrap: "wrap", gap: 0.5, mb: 1 }}>
              {person.interests.slice(0, 4).map((interest) => (
                <Chip key={interest} label={interest} size="small" />
              ))}
            </Stack>
          )}
          {person.likedMe && (
            <Chip label="They liked you" color="secondary" size="small" sx={{ mb: 1 }} icon={<FavoriteIcon />} />
          )}
          <Button size="small" onClick={onOpen} sx={{ px: 0 }}>
            View full profile
          </Button>
        </Box>
      </Card>

      <Typography variant="caption" color="text.secondary" sx={{ display: "block", textAlign: "center", mt: 1.5 }}>
        Swipe right to like, left to skip
      </Typography>

      <Stack direction="row" spacing={2} justifyContent="center" sx={{ mt: 2 }}>
        <Tooltip title="Skip">
          <IconButton
            onClick={onSkip}
            sx={{ width: 58, height: 58, bgcolor: "background.paper", border: "1px solid", borderColor: "divider", color: "error.main" }}
            aria-label="Skip this person"
          >
            <CloseIcon />
          </IconButton>
        </Tooltip>
        <Tooltip title="Send friend request">
          <IconButton
            onClick={onRequest}
            sx={{ width: 48, height: 48, alignSelf: "center", bgcolor: "background.paper", border: "1px solid", borderColor: "divider" }}
            aria-label="Send friend request"
          >
            <PersonAddAltIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title="Like">
          <IconButton
            onClick={onLike}
            sx={{ width: 58, height: 58, bgcolor: "primary.main", color: "primary.contrastText", "&:hover": { bgcolor: "primary.dark" } }}
            aria-label="Like this person"
          >
            <FavoriteBorderIcon />
          </IconButton>
        </Tooltip>
      </Stack>

      {hasMore && (
        <Box sx={{ display: "flex", justifyContent: "center", mt: 2 }}>
          <Button size="small" onClick={onLoadMore} disabled={loadingMore}>
            {loadingMore ? "Loading…" : "Load more people"}
          </Button>
        </Box>
      )}
    </Box>
  );
}

function ProfileDialog({
  person,
  onClose,
  onLike,
  onRequest,
  onChat,
}: {
  person: User | null;
  onClose: () => void;
  onLike: (person: User) => void;
  onRequest: (person: User) => void;
  onChat: (person: User) => void;
}) {
  if (!person) return null;
  return (
    <Dialog open={!!person} onClose={onClose} maxWidth="sm" fullWidth>
      <Box
        sx={{
          height: 150,
          background: person.coverUrl
            ? `center/cover no-repeat url(${person.coverUrl})`
            : "linear-gradient(135deg,#0f9d76,#38bdf8)",
        }}
      />
      <DialogContent sx={{ mt: -6 }}>
        <UserAvatar
          src={person.avatarUrl}
          name={person.name}
          size={92}
          sx={{ border: "4px solid", borderColor: "background.paper" }}
          online={person.isOnline}
          showPresence
        />
        <Stack direction="row" alignItems="baseline" spacing={1} sx={{ mt: 1 }}>
          <Typography variant="h5">{person.name}</Typography>
          {person.age ? <Typography color="text.secondary">{person.age}</Typography> : null}
        </Stack>
        <Typography variant="body2" color="text.secondary">
          {[person.username ? `@${person.username}` : null, person.occupation, person.distanceLabel]
            .filter(Boolean)
            .join(" · ")}
        </Typography>
        {person.bio && (
          <Typography variant="body2" sx={{ mt: 2 }}>
            {person.bio}
          </Typography>
        )}

        <Stack spacing={1.5} sx={{ mt: 2 }}>
          {!!person.interests?.length && (
            <Box>
              <Typography variant="overline" color="text.secondary">
                Interests
              </Typography>
              <Stack direction="row" spacing={0.5} sx={{ flexWrap: "wrap", gap: 0.5 }}>
                {person.interests.map((interest) => (
                  <Chip key={interest} label={interest} size="small" />
                ))}
              </Stack>
            </Box>
          )}
          {!!person.languages?.length && (
            <Box>
              <Typography variant="overline" color="text.secondary">
                Languages
              </Typography>
              <Typography variant="body2">{person.languages.join(", ")}</Typography>
            </Box>
          )}
          <Typography variant="caption" color="text.disabled">
            Active {formatRelative(person.lastActiveAt)}
          </Typography>
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2.5, gap: 1 }}>
        <Button onClick={onClose} color="inherit">
          Close
        </Button>
        <Button variant="outlined" startIcon={<PersonAddAltIcon />} onClick={() => onRequest(person)}>
          Add friend
        </Button>
        {person.isFriend ? (
          <Button variant="outlined" startIcon={<ChatBubbleOutlineIcon />} onClick={() => onChat(person)}>
            Message
          </Button>
        ) : null}
        <Button variant="contained" startIcon={<FavoriteIcon />} onClick={() => onLike(person)}>
          Like
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function LikesPanel({
  onLike,
  onRequest,
  onOpen,
  onDismiss,
}: {
  onLike: (person: User) => void;
  onRequest: (person: User) => void;
  onOpen: (person: User) => void;
  onDismiss: (person: User) => void;
}) {
  const [people, setPeople] = React.useState<User[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    api<User[]>("/discovery/likes")
      .then((data) => setPeople(data || []))
      .catch(() => setPeople([]))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <CardGridSkeleton count={3} />;
  if (!people.length) {
    return (
      <EmptyState
        icon={FavoriteBorderIcon}
        title="No likes yet"
        description="When someone likes your profile, they will show up here."
      />
    );
  }
  return (
    <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", sm: "repeat(2, 1fr)", lg: "repeat(3, 1fr)" } }}>
      {people.map((person) => (
        <PersonCard
          key={person._id}
          person={person}
          onLike={() => onLike(person)}
          onSkip={() => {
            setPeople((prev) => prev.filter((p) => p._id !== person._id));
            onDismiss(person);
          }}
          onRequest={() => onRequest(person)}
          onOpen={() => onOpen(person)}
        />
      ))}
    </Box>
  );
}
