units m

defaults {
  door_width 0.9
  window_width 1.5
}

plan "Generated Plan" {
  footprint rect (0, 0) (16, 12)

  # circulation/full
  room hall {
    rect (5, 0) (7.5, 12)
    label "Hallway"
  }

  # public/full
  room garage {
    rect (7.5, 0) (12.1, 6.25)
    label "Garage"
  }
  room living {
    rect (7.5, 6.25) (16, 12)
    label "Living Room"
  }
  room kitchen {
    rect (12.1, 0) (16, 6.25)
    label "Kitchen"
  }

  # private/full
  room master {
    rect (0, 7.7) (5, 12)
    label "Master Bedroom"
  }
  room ensuite {
    rect (0, 5.6) (5, 7.7)
    label "Ensuite"
  }
  room bedroom2 {
    rect (0, 0) (5, 3)
    label "Bedroom 2"
  }
  room bath {
    rect (0, 3) (5, 5.6)
    label "Bathroom"
  }

  # Openings
  opening door d1 {
    between hall and garage
    on shared_edge
    at 50%
    width 0.9
  }
  opening door d2 {
    between hall and living
    on shared_edge
    at 50%
    width 0.9
  }
  opening door d3 {
    between hall and master
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
    between garage and kitchen
    on shared_edge
    at 50%
    width 0.9
  }
  opening door d6 {
    between living and kitchen
    on shared_edge
    at 50%
    width 0.9
  }
  opening door d7 {
    between ensuite and master
    on shared_edge
    at 50%
    width 0.9
  }
  opening door d8 {
    between bath and hall
    on shared_edge
    at 50%
    width 0.9
  }
  opening door d9 {
    on hall.edge south
    at 50%
    width 1.1
  }
  opening window w10 {
    on living.edge north
    at 50%
    width 2.25
  }
  opening window w11 {
    on master.edge north
    at 50%
    width 1.5
  }
  opening window w12 {
    on ensuite.edge west
    at 50%
    width 0.75
  }
  opening window w13 {
    on bedroom2.edge south
    at 50%
    width 1.5
  }
  opening window w14 {
    on bath.edge west
    at 50%
    width 0.75
  }

  # Validation
  assert no_overlap rooms
  assert inside footprint all_rooms
}