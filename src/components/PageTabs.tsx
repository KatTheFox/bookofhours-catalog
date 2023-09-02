import * as React from "react";
import { useLocation, useNavigate } from "react-router";

import Tabs from "@mui/material/Tabs";
import Tab from "@mui/material/Tab";

import AspectIcon from "./AspectIcon";

const tabData = [
  {
    label: "Books",
    aspectIcon: "readable",
    path: "/book-catalog",
  },
  {
    label: "Provisions",
    aspectIcon: "beverage",
    path: "/provisions-catalog",
  },
  {
    label: "Tools",
    aspectIcon: "tool",
    path: "/tools-catalog",
  },
  {
    label: "Materials",
    aspectIcon: "material",
    path: "/materials-catalog",
  },
  {
    label: "Furnishings",
    aspectIcon: "comfort",
    path: "/furnishings-catalog",
  },
  {
    label: "Memories",
    aspectIcon: "memory",
    path: "/memories",
  },
];

const PageTabs = () => {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  return (
    <Tabs
      sx={{ height: "100%" }}
      orientation="vertical"
      value={firstPathPart(pathname)}
      onChange={(_, value) => {
        navigate(value);
      }}
    >
      {tabData.map(({ label, aspectIcon, path }) => (
        <Tab
          key={label}
          value={path}
          title={label}
          icon={<AspectIcon aspectId={aspectIcon} size={40} />}
        />
      ))}
    </Tabs>
  );
};

function firstPathPart(pathname: string) {
  const [_, firstPart] = pathname.split("/", 2);
  return "/" + firstPart;
}

export default PageTabs;
