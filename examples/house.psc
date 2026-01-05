# Example House Floor Plan
# This demonstrates the full syntax of PlanScript

units m
origin (0,0)

# Default widths for doors and windows
defaults {
  door_width 0.9
  window_width 2.4
}

plan "Example House" {
  footprint rect (0,0) (20,30)

  # Main living area
  room living {
    rect (1,1) (9,7)
    label "Living Room"
  }

  # Kitchen attached to living room
  room kitchen {
    rect size (4,6)
    attach east_of living
    align top
    gap 0
    label "Kitchen"
  }

  # Hallway spanning from living to kitchen
  room hall {
    rect span x from living.left to kitchen.right y (7, 9)
    label "Hallway"
  }

  # Bedroom
  room bedroom {
    rect at (1,9) size (3.6,4.0)
    label "Master Bedroom"
  }

  # Bathroom attached to bedroom
  room bath {
    rect size (2.6,2.2)
    attach east_of bedroom
    align top
    label "Bathroom"
  }

  # Door between living and hall (uses default door_width)
  # at 60% means 60% along the shared wall
  opening door d1 {
    between living and hall
    on shared_edge
    at 60%
  }

  # Door between living and kitchen (uses default door_width)
  # at 50% means centered on the shared wall
  opening door d2 {
    between living and kitchen
    on shared_edge
    at 50%
  }

  # Door between hallway and master bedroom (uses default door_width)
  opening door d3 {
    between hall and bedroom
    on shared_edge
    at 50%
  }

  # Window on living room south wall (uses default window_width)
  # at 2.0 means 2.0 meters from the left edge of the wall
  opening window w1 {
    on living.edge south
    at 2.0
    sill 0.9
  }

  # Assertions for validation
  assert no_overlap rooms
  assert inside footprint all_rooms
  assert min_room_area bedroom >= 12.0
}
