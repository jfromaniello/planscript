units m

defaults {
  door_width 0.9
  window_width 1.5
}

plan "Generated Plan" {
  footprint rect (0, 0) (14, 10)

  # circulation/full
  room hall {
    rect (5, 0) (7, 8)
    label "Hallway"
  }
  room bath {
    rect (5, 8) (7, 10)
    label "Bathroom"
  }

  # public/full
  room living {
    rect (7, 3) (14, 10)
    label "Living Room"
  }
  room kitchen {
    rect (7, 0) (14, 3)
    label "Kitchen"
  }

  # private/full
  room master {
    rect (0, 3) (5, 10)
    label "Master Bedroom"
  }
  room bedroom2 {
    rect (0, 0) (5, 3)
    label "Bedroom 2"
  }

  # Openings
  opening door d1 {
    between hall and living
    on shared_edge
    at 50%
    width 0.9
  }
  opening door d2 {
    between hall and master
    on shared_edge
    at 50%
    width 0.9
  }
  opening door d3 {
    between hall and kitchen
    on shared_edge
    at 50%
    width 0.9
  }
  opening door d4 {
    between hall and bedroom2
    on shared_edge
    at 50%
    width 0.9
  }
  opening door d5 {
    between living and kitchen
    on shared_edge
    at 50%
    width 0.9
  }
  opening door d6 {
    between bath and hall
    on shared_edge
    at 50%
    width 0.9
  }
  opening door d7 {
    on hall.edge south
    at 50%
    width 1
  }
  opening window w8 {
    on living.edge north
    at 50%
    width 2.25
  }
  opening window w9 {
    on master.edge west
    at 50%
    width 1.5
  }
  opening window w10 {
    on bedroom2.edge south
    at 50%
    width 1.5
  }
  opening window w11 {
    on bath.edge north
    at 50%
    width 0.75
  }

  # Validation
  assert no_overlap rooms
  assert inside footprint all_rooms
}