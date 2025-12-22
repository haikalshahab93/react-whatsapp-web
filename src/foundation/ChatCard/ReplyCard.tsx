import React from "react";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import { colors } from "../../theme";

const ReplyMessageCard = ({ text, time, name }: { text: string; time?: string; name?: string }) => {
  return (
    <Paper
      sx={{
        background: colors.black1,
        display: "flex",
        alignSelf: "flex-end",
        maxWidth: { xs: "75%", sm: "60%" },
        textAlign: "start",
        padding: { xs: ".5rem .8rem", sm: ".35rem .8rem" },
        flexDirection: "column",
        borderRadius: ".625rem",
        position: "relative",

        "&::after": {
          content: '" "',
          border: "20px solid transparent",
          position: "absolute",
          top: 0,
          right: "-1.25rem",
          borderTopRightRadius: ".5rem",
          borderTopColor: colors.black1,
        },
      }}
    >
      {name ? (
        <Typography color={colors.grey1} sx={{ fontSize: { xs: ".7rem", sm: ".75rem" }, mb: 0.25 }}>
          {name}
        </Typography>
      ) : null}
      <Typography
        color={colors.white1}
        sx={{
          fontSize: { xs: "0.95rem", sm: "1rem" },
        }}
      >
        {text}
      </Typography>
      <Typography
        color={colors.grey1}
        sx={{
          fontSize: { xs: ".75rem", sm: ".85rem" },
          display: "flex",
          alignSelf: "flex-end",
        }}
      >
        {time ?? ''}
      </Typography>
    </Paper>
  );
};

export default ReplyMessageCard;
