export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      afirmaciones: {
        Row: {
          autor_id: string
          cita: string
          creada_en: string
          dolor: string | null
          emocion: string | null
          evidencia: string
          excluida: boolean
          gancho: string | null
          id: string
          idioma: string | null
          material_id: string
          postura: string | null
          publico: string | null
          tema_id: string | null
          texto: string
          tipo: string
          tramo: number
          ubicacion: Json
          vector: string | null
        }
        Insert: {
          autor_id: string
          cita: string
          creada_en?: string
          dolor?: string | null
          emocion?: string | null
          evidencia: string
          excluida?: boolean
          gancho?: string | null
          id?: string
          idioma?: string | null
          material_id: string
          postura?: string | null
          publico?: string | null
          tema_id?: string | null
          texto: string
          tipo: string
          tramo: number
          ubicacion: Json
          vector?: string | null
        }
        Update: {
          autor_id?: string
          cita?: string
          creada_en?: string
          dolor?: string | null
          emocion?: string | null
          evidencia?: string
          excluida?: boolean
          gancho?: string | null
          id?: string
          idioma?: string | null
          material_id?: string
          postura?: string | null
          publico?: string | null
          tema_id?: string | null
          texto?: string
          tipo?: string
          tramo?: number
          ubicacion?: Json
          vector?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "afirmaciones_autor_id_fkey"
            columns: ["autor_id"]
            isOneToOne: false
            referencedRelation: "autores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "afirmaciones_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "materiales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "afirmaciones_tema_id_fkey"
            columns: ["tema_id"]
            isOneToOne: false
            referencedRelation: "temas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "afirmaciones_tema_id_fkey"
            columns: ["tema_id"]
            isOneToOne: false
            referencedRelation: "temas_resumen"
            referencedColumns: ["id"]
          },
        ]
      }
      ajustes: {
        Row: {
          avatar_visto_en: string | null
          avisos_resumen: boolean
          avisos_urgentes: boolean
          destinos_por_defecto: string[]
          dias_publicacion: number[]
          enlaces: Json
          hora_publicacion: string
          id: boolean
          ideas_por_semana: number
          meta: string
          meta_cuenta_id: string | null
          meta_token_expira_en: string | null
          produccion: Json
          tope_mensual_usd: number
          zona: string
        }
        Insert: {
          avatar_visto_en?: string | null
          avisos_resumen?: boolean
          avisos_urgentes?: boolean
          destinos_por_defecto?: string[]
          dias_publicacion?: number[]
          enlaces?: Json
          hora_publicacion?: string
          id?: boolean
          ideas_por_semana?: number
          meta?: string
          meta_cuenta_id?: string | null
          meta_token_expira_en?: string | null
          produccion?: Json
          tope_mensual_usd?: number
          zona?: string
        }
        Update: {
          avatar_visto_en?: string | null
          avisos_resumen?: boolean
          avisos_urgentes?: boolean
          destinos_por_defecto?: string[]
          dias_publicacion?: number[]
          enlaces?: Json
          hora_publicacion?: string
          id?: boolean
          ideas_por_semana?: number
          meta?: string
          meta_cuenta_id?: string | null
          meta_token_expira_en?: string | null
          produccion?: Json
          tope_mensual_usd?: number
          zona?: string
        }
        Relationships: []
      }
      autores: {
        Row: {
          alias: string[]
          creado_en: string
          creado_por: string | null
          credencial: string | null
          id: string
          nombre: string
          nombre_normalizado: string | null
          tipo: string
        }
        Insert: {
          alias?: string[]
          creado_en?: string
          creado_por?: string | null
          credencial?: string | null
          id?: string
          nombre: string
          nombre_normalizado?: string | null
          tipo: string
        }
        Update: {
          alias?: string[]
          creado_en?: string
          creado_por?: string | null
          credencial?: string | null
          id?: string
          nombre?: string
          nombre_normalizado?: string | null
          tipo?: string
        }
        Relationships: []
      }
      avisos: {
        Row: {
          canal: string | null
          clave: string
          creado_en: string
          enviado_en: string | null
          id: string
          leido_en: string | null
          mensaje: string
          pieza_id: string | null
          tipo: string
        }
        Insert: {
          canal?: string | null
          clave: string
          creado_en?: string
          enviado_en?: string | null
          id?: string
          leido_en?: string | null
          mensaje: string
          pieza_id?: string | null
          tipo: string
        }
        Update: {
          canal?: string | null
          clave?: string
          creado_en?: string
          enviado_en?: string | null
          id?: string
          leido_en?: string | null
          mensaje?: string
          pieza_id?: string | null
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "avisos_pieza_id_fkey"
            columns: ["pieza_id"]
            isOneToOne: false
            referencedRelation: "piezas"
            referencedColumns: ["id"]
          },
        ]
      }
      categorias: {
        Row: {
          creada_en: string
          creada_por: string | null
          id: string
          nombre: string
          nombre_normalizado: string | null
          slug: string
        }
        Insert: {
          creada_en?: string
          creada_por?: string | null
          id?: string
          nombre: string
          nombre_normalizado?: string | null
          slug: string
        }
        Update: {
          creada_en?: string
          creada_por?: string | null
          id?: string
          nombre?: string
          nombre_normalizado?: string | null
          slug?: string
        }
        Relationships: []
      }
      clics_enlace_dia: {
        Row: {
          clics: number
          dia: string
          enlace: string
        }
        Insert: {
          clics?: number
          dia: string
          enlace: string
        }
        Update: {
          clics?: number
          dia?: string
          enlace?: string
        }
        Relationships: []
      }
      consultas: {
        Row: {
          anotada_en: string
          id: string
        }
        Insert: {
          anotada_en?: string
          id?: string
        }
        Update: {
          anotada_en?: string
          id?: string
        }
        Relationships: []
      }
      embeddings_ficha: {
        Row: {
          creado_en: string
          material_id: string
          modelo: string
          vector: string
        }
        Insert: {
          creado_en?: string
          material_id: string
          modelo: string
          vector: string
        }
        Update: {
          creado_en?: string
          material_id?: string
          modelo?: string
          vector?: string
        }
        Relationships: [
          {
            foreignKeyName: "embeddings_ficha_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: true
            referencedRelation: "materiales"
            referencedColumns: ["id"]
          },
        ]
      }
      eventos: {
        Row: {
          actor_rol: string
          actor_usuario: string | null
          datos: Json | null
          en: string
          id: number
          operacion: string
          pieza_id: string | null
          tabla: string
        }
        Insert: {
          actor_rol: string
          actor_usuario?: string | null
          datos?: Json | null
          en?: string
          id?: never
          operacion: string
          pieza_id?: string | null
          tabla: string
        }
        Update: {
          actor_rol?: string
          actor_usuario?: string | null
          datos?: Json | null
          en?: string
          id?: never
          operacion?: string
          pieza_id?: string | null
          tabla?: string
        }
        Relationships: []
      }
      fichas: {
        Row: {
          citas: Json
          editada_en: string | null
          editada_por: string | null
          fuente: Json
          ideas_clave: Json
          material_id: string
          resumen: string
        }
        Insert: {
          citas: Json
          editada_en?: string | null
          editada_por?: string | null
          fuente: Json
          ideas_clave: Json
          material_id: string
          resumen: string
        }
        Update: {
          citas?: Json
          editada_en?: string | null
          editada_por?: string | null
          fuente?: Json
          ideas_clave?: Json
          material_id?: string
          resumen?: string
        }
        Relationships: [
          {
            foreignKeyName: "fichas_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: true
            referencedRelation: "materiales"
            referencedColumns: ["id"]
          },
        ]
      }
      gastos: {
        Row: {
          clave: string
          creado_en: string
          estado: string
          estimado_usd: number
          id: number
          mes: string
          paso: string
          pieza_id: string | null
          proveedor: string
          real_usd: number | null
        }
        Insert: {
          clave: string
          creado_en?: string
          estado?: string
          estimado_usd: number
          id?: never
          mes: string
          paso: string
          pieza_id?: string | null
          proveedor: string
          real_usd?: number | null
        }
        Update: {
          clave?: string
          creado_en?: string
          estado?: string
          estimado_usd?: number
          id?: never
          mes?: string
          paso?: string
          pieza_id?: string | null
          proveedor?: string
          real_usd?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "gastos_pieza_id_fkey"
            columns: ["pieza_id"]
            isOneToOne: false
            referencedRelation: "piezas"
            referencedColumns: ["id"]
          },
        ]
      }
      guias: {
        Row: {
          creada_en: string
          texto: string
          version: number
          vigente: boolean
        }
        Insert: {
          creada_en?: string
          texto: string
          version: number
          vigente?: boolean
        }
        Update: {
          creada_en?: string
          texto?: string
          version?: number
          vigente?: boolean
        }
        Relationships: []
      }
      guion_versiones: {
        Row: {
          autor: string
          creada_en: string
          creada_por: string | null
          guion: string
          numero: number
          pieza_id: string
          texto: string | null
        }
        Insert: {
          autor: string
          creada_en?: string
          creada_por?: string | null
          guion: string
          numero: number
          pieza_id: string
          texto?: string | null
        }
        Update: {
          autor?: string
          creada_en?: string
          creada_por?: string | null
          guion?: string
          numero?: number
          pieza_id?: string
          texto?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "guion_versiones_pieza_id_fkey"
            columns: ["pieza_id"]
            isOneToOne: false
            referencedRelation: "piezas"
            referencedColumns: ["id"]
          },
        ]
      }
      ideas: {
        Row: {
          alertas: Json
          creada_en: string
          estado: string
          fijada_en: string | null
          formato: string
          fuentes: Json
          fuerza: string
          gancho: string
          id: string
          motivo_descarte: string | null
          numero: number | null
          origen: string
          pilar: Database["public"]["Enums"]["pilar"]
          semana: string | null
          tema: string
          teoria_id: string | null
        }
        Insert: {
          alertas?: Json
          creada_en?: string
          estado?: string
          fijada_en?: string | null
          formato?: string
          fuentes?: Json
          fuerza: string
          gancho: string
          id?: string
          motivo_descarte?: string | null
          numero?: number | null
          origen?: string
          pilar: Database["public"]["Enums"]["pilar"]
          semana?: string | null
          tema?: string
          teoria_id?: string | null
        }
        Update: {
          alertas?: Json
          creada_en?: string
          estado?: string
          fijada_en?: string | null
          formato?: string
          fuentes?: Json
          fuerza?: string
          gancho?: string
          id?: string
          motivo_descarte?: string | null
          numero?: number | null
          origen?: string
          pilar?: Database["public"]["Enums"]["pilar"]
          semana?: string | null
          tema?: string
          teoria_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ideas_teoria_id_fkey"
            columns: ["teoria_id"]
            isOneToOne: false
            referencedRelation: "teorias"
            referencedColumns: ["id"]
          },
        ]
      }
      intervenciones: {
        Row: {
          canal: string
          en: string
          id: number
          pieza_id: string | null
          que: string
          quien: string
          registrada_por: string | null
        }
        Insert: {
          canal: string
          en?: string
          id?: never
          pieza_id?: string | null
          que: string
          quien: string
          registrada_por?: string | null
        }
        Update: {
          canal?: string
          en?: string
          id?: never
          pieza_id?: string | null
          que?: string
          quien?: string
          registrada_por?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "intervenciones_pieza_id_fkey"
            columns: ["pieza_id"]
            isOneToOne: false
            referencedRelation: "piezas"
            referencedColumns: ["id"]
          },
        ]
      }
      materiales: {
        Row: {
          archivo_clave: string | null
          autor: string | null
          autor_id: string
          categoria_id: string | null
          corrida_desde: string | null
          corrida_id: string | null
          costo_confirmado_en: string | null
          costo_estimado_usd: number | null
          creado_en: string
          declaracion_sin_pacientes_en: string
          estado: string
          etiquetas: string[]
          id: string
          idioma_original: string | null
          motivo_fallo: string | null
          origen_url: string | null
          rol: string
          subido_por: string
          texto_clave: string | null
          texto_pegado: string | null
          tipo: string
          titulo: string | null
        }
        Insert: {
          archivo_clave?: string | null
          autor?: string | null
          autor_id: string
          categoria_id?: string | null
          corrida_desde?: string | null
          corrida_id?: string | null
          costo_confirmado_en?: string | null
          costo_estimado_usd?: number | null
          creado_en?: string
          declaracion_sin_pacientes_en: string
          estado?: string
          etiquetas?: string[]
          id?: string
          idioma_original?: string | null
          motivo_fallo?: string | null
          origen_url?: string | null
          rol?: string
          subido_por?: string
          texto_clave?: string | null
          texto_pegado?: string | null
          tipo: string
          titulo?: string | null
        }
        Update: {
          archivo_clave?: string | null
          autor?: string | null
          autor_id?: string
          categoria_id?: string | null
          corrida_desde?: string | null
          corrida_id?: string | null
          costo_confirmado_en?: string | null
          costo_estimado_usd?: number | null
          creado_en?: string
          declaracion_sin_pacientes_en?: string
          estado?: string
          etiquetas?: string[]
          id?: string
          idioma_original?: string | null
          motivo_fallo?: string | null
          origen_url?: string | null
          rol?: string
          subido_por?: string
          texto_clave?: string | null
          texto_pegado?: string | null
          tipo?: string
          titulo?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "materiales_autor_id_fkey"
            columns: ["autor_id"]
            isOneToOne: false
            referencedRelation: "autores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "materiales_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "categorias"
            referencedColumns: ["id"]
          },
        ]
      }
      materiales_archivos: {
        Row: {
          archivo_clave: string
          material_id: string
          orden: number
        }
        Insert: {
          archivo_clave: string
          material_id: string
          orden: number
        }
        Update: {
          archivo_clave?: string
          material_id?: string
          orden?: number
        }
        Relationships: [
          {
            foreignKeyName: "materiales_archivos_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "materiales"
            referencedColumns: ["id"]
          },
        ]
      }
      metricas_cuenta: {
        Row: {
          dia: string
          leido_en: string
          toques_perfil: number
        }
        Insert: {
          dia: string
          leido_en?: string
          toques_perfil: number
        }
        Update: {
          dia?: string
          leido_en?: string
          toques_perfil?: number
        }
        Relationships: []
      }
      metricas_reel: {
        Row: {
          alcance: number | null
          comentarios: number | null
          compartidos: number | null
          dia: string
          guardados: number | null
          leido_en: string
          pieza_id: string
          tiempo_promedio: number | null
        }
        Insert: {
          alcance?: number | null
          comentarios?: number | null
          compartidos?: number | null
          dia: string
          guardados?: number | null
          leido_en?: string
          pieza_id: string
          tiempo_promedio?: number | null
        }
        Update: {
          alcance?: number | null
          comentarios?: number | null
          compartidos?: number | null
          dia?: string
          guardados?: number | null
          leido_en?: string
          pieza_id?: string
          tiempo_promedio?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "metricas_reel_pieza_id_fkey"
            columns: ["pieza_id"]
            isOneToOne: false
            referencedRelation: "piezas"
            referencedColumns: ["id"]
          },
        ]
      }
      miembros: {
        Row: {
          creado_en: string
          rol: string
          user_id: string
        }
        Insert: {
          creado_en?: string
          rol: string
          user_id: string
        }
        Update: {
          creado_en?: string
          rol?: string
          user_id?: string
        }
        Relationships: []
      }
      motor_corridas: {
        Row: {
          costo_usd: number
          creada_en: string
          estado: string
          id: string
          motivo_fallo: string | null
          resumen: Json
          semana: string
          terminada_en: string | null
        }
        Insert: {
          costo_usd?: number
          creada_en?: string
          estado?: string
          id?: string
          motivo_fallo?: string | null
          resumen?: Json
          semana: string
          terminada_en?: string | null
        }
        Update: {
          costo_usd?: number
          creada_en?: string
          estado?: string
          id?: string
          motivo_fallo?: string | null
          resumen?: Json
          semana?: string
          terminada_en?: string | null
        }
        Relationships: []
      }
      piezas: {
        Row: {
          actualizada_en: string
          archivos_borrados_en: string | null
          audio_id: string | null
          avatar_id: string | null
          contenedor_clave: string | null
          contenedor_id: string | null
          creada_en: string
          destinos: string[]
          estado: Database["public"]["Enums"]["estado_pieza"]
          estado_antes_del_error:
            | Database["public"]["Enums"]["estado_pieza"]
            | null
          explicacion: string | null
          guion: string | null
          id: string
          idea_id: string | null
          intento: number
          media_id: string | null
          permalink: string | null
          publicacion_enviada_en: string | null
          publicacion_reclamada_hasta: string | null
          puerta1_en: string | null
          puerta1_formula: number | null
          puerta1_hash: string | null
          puerta1_por: string | null
          puerta2_en: string | null
          puerta2_formula: number | null
          puerta2_hash_texto: string | null
          puerta2_por: string | null
          puerta2_publicar_en: string | null
          puerta2_video_id: string | null
          render_id: string | null
          respaldo: Json | null
          revision: Json
          texto: string | null
          texto_linkedin: string | null
          titulo: string
          version: number
          video_id: string | null
        }
        Insert: {
          actualizada_en?: string
          archivos_borrados_en?: string | null
          audio_id?: string | null
          avatar_id?: string | null
          contenedor_clave?: string | null
          contenedor_id?: string | null
          creada_en?: string
          destinos?: string[]
          estado?: Database["public"]["Enums"]["estado_pieza"]
          estado_antes_del_error?:
            | Database["public"]["Enums"]["estado_pieza"]
            | null
          explicacion?: string | null
          guion?: string | null
          id?: string
          idea_id?: string | null
          intento?: number
          media_id?: string | null
          permalink?: string | null
          publicacion_enviada_en?: string | null
          publicacion_reclamada_hasta?: string | null
          puerta1_en?: string | null
          puerta1_formula?: number | null
          puerta1_hash?: string | null
          puerta1_por?: string | null
          puerta2_en?: string | null
          puerta2_formula?: number | null
          puerta2_hash_texto?: string | null
          puerta2_por?: string | null
          puerta2_publicar_en?: string | null
          puerta2_video_id?: string | null
          render_id?: string | null
          respaldo?: Json | null
          revision?: Json
          texto?: string | null
          texto_linkedin?: string | null
          titulo: string
          version?: number
          video_id?: string | null
        }
        Update: {
          actualizada_en?: string
          archivos_borrados_en?: string | null
          audio_id?: string | null
          avatar_id?: string | null
          contenedor_clave?: string | null
          contenedor_id?: string | null
          creada_en?: string
          destinos?: string[]
          estado?: Database["public"]["Enums"]["estado_pieza"]
          estado_antes_del_error?:
            | Database["public"]["Enums"]["estado_pieza"]
            | null
          explicacion?: string | null
          guion?: string | null
          id?: string
          idea_id?: string | null
          intento?: number
          media_id?: string | null
          permalink?: string | null
          publicacion_enviada_en?: string | null
          publicacion_reclamada_hasta?: string | null
          puerta1_en?: string | null
          puerta1_formula?: number | null
          puerta1_hash?: string | null
          puerta1_por?: string | null
          puerta2_en?: string | null
          puerta2_formula?: number | null
          puerta2_hash_texto?: string | null
          puerta2_por?: string | null
          puerta2_publicar_en?: string | null
          puerta2_video_id?: string | null
          render_id?: string | null
          respaldo?: Json | null
          revision?: Json
          texto?: string | null
          texto_linkedin?: string | null
          titulo?: string
          version?: number
          video_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "piezas_idea_id_fkey"
            columns: ["idea_id"]
            isOneToOne: false
            referencedRelation: "ideas"
            referencedColumns: ["id"]
          },
        ]
      }
      publicaciones: {
        Row: {
          destino: string
          enlace: string | null
          estado: string
          marcado_en: string | null
          marcado_por: string | null
          pieza_id: string
        }
        Insert: {
          destino: string
          enlace?: string | null
          estado: string
          marcado_en?: string | null
          marcado_por?: string | null
          pieza_id: string
        }
        Update: {
          destino?: string
          enlace?: string | null
          estado?: string
          marcado_en?: string | null
          marcado_por?: string | null
          pieza_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "publicaciones_pieza_id_fkey"
            columns: ["pieza_id"]
            isOneToOne: false
            referencedRelation: "piezas"
            referencedColumns: ["id"]
          },
        ]
      }
      suscripciones_push: {
        Row: {
          auth: string
          creada_en: string
          endpoint: string
          fallos: number
          id: string
          p256dh: string
          ultimo_ok_en: string | null
          user_agent: string | null
          user_id: string
        }
        Insert: {
          auth: string
          creada_en?: string
          endpoint: string
          fallos?: number
          id?: string
          p256dh: string
          ultimo_ok_en?: string | null
          user_agent?: string | null
          user_id?: string
        }
        Update: {
          auth?: string
          creada_en?: string
          endpoint?: string
          fallos?: number
          id?: string
          p256dh?: string
          ultimo_ok_en?: string | null
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      temas: {
        Row: {
          actualizado_en: string
          alias: string[]
          categoria_id: string | null
          centroide: string
          creado_en: string
          descripcion: string | null
          fusionado_en: string | null
          id: string
          nombre: string
          nombre_normalizado: string | null
        }
        Insert: {
          actualizado_en?: string
          alias?: string[]
          categoria_id?: string | null
          centroide: string
          creado_en?: string
          descripcion?: string | null
          fusionado_en?: string | null
          id?: string
          nombre: string
          nombre_normalizado?: string | null
        }
        Update: {
          actualizado_en?: string
          alias?: string[]
          categoria_id?: string | null
          centroide?: string
          creado_en?: string
          descripcion?: string | null
          fusionado_en?: string | null
          id?: string
          nombre?: string
          nombre_normalizado?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "temas_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "categorias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "temas_fusionado_en_fkey"
            columns: ["fusionado_en"]
            isOneToOne: false
            referencedRelation: "temas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "temas_fusionado_en_fkey"
            columns: ["fusionado_en"]
            isOneToOne: false
            referencedRelation: "temas_resumen"
            referencedColumns: ["id"]
          },
        ]
      }
      temas_fusion_rechazada: {
        Row: {
          rechazada_en: string
          tema_a: string
          tema_b: string
        }
        Insert: {
          rechazada_en?: string
          tema_a: string
          tema_b: string
        }
        Update: {
          rechazada_en?: string
          tema_a?: string
          tema_b?: string
        }
        Relationships: [
          {
            foreignKeyName: "temas_fusion_rechazada_tema_a_fkey"
            columns: ["tema_a"]
            isOneToOne: false
            referencedRelation: "temas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "temas_fusion_rechazada_tema_a_fkey"
            columns: ["tema_a"]
            isOneToOne: false
            referencedRelation: "temas_resumen"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "temas_fusion_rechazada_tema_b_fkey"
            columns: ["tema_b"]
            isOneToOne: false
            referencedRelation: "temas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "temas_fusion_rechazada_tema_b_fkey"
            columns: ["tema_b"]
            isOneToOne: false
            referencedRelation: "temas_resumen"
            referencedColumns: ["id"]
          },
        ]
      }
      teoria_afirmaciones: {
        Row: {
          afirmacion_id: string
          aporte: string
          teoria_id: string
        }
        Insert: {
          afirmacion_id: string
          aporte: string
          teoria_id: string
        }
        Update: {
          afirmacion_id?: string
          aporte?: string
          teoria_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "teoria_afirmaciones_afirmacion_id_fkey"
            columns: ["afirmacion_id"]
            isOneToOne: false
            referencedRelation: "afirmaciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teoria_afirmaciones_teoria_id_fkey"
            columns: ["teoria_id"]
            isOneToOne: false
            referencedRelation: "teorias"
            referencedColumns: ["id"]
          },
        ]
      }
      teoria_fuentes: {
        Row: {
          material_id: string
          teoria_id: string
        }
        Insert: {
          material_id: string
          teoria_id: string
        }
        Update: {
          material_id?: string
          teoria_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "teoria_fuentes_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "materiales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teoria_fuentes_teoria_id_fkey"
            columns: ["teoria_id"]
            isOneToOne: false
            referencedRelation: "teorias"
            referencedColumns: ["id"]
          },
        ]
      }
      teorias: {
        Row: {
          advertencias: Json
          argumentos: Json | null
          categoria_id: string | null
          componentes: Json | null
          contradicciones: Json | null
          creada_en: string
          creada_por: string | null
          editada_en: string | null
          estado: string
          id: string
          motivo_codigo: string | null
          motivo_fallo: string | null
          nivel_evidencia: string | null
          origen: string
          por_que: string | null
          puntaje: number | null
          semana: string | null
          sintetizando_desde: string
          temas: string[]
          tesis: string | null
          titulo: string | null
        }
        Insert: {
          advertencias?: Json
          argumentos?: Json | null
          categoria_id?: string | null
          componentes?: Json | null
          contradicciones?: Json | null
          creada_en?: string
          creada_por?: string | null
          editada_en?: string | null
          estado?: string
          id?: string
          motivo_codigo?: string | null
          motivo_fallo?: string | null
          nivel_evidencia?: string | null
          origen?: string
          por_que?: string | null
          puntaje?: number | null
          semana?: string | null
          sintetizando_desde?: string
          temas?: string[]
          tesis?: string | null
          titulo?: string | null
        }
        Update: {
          advertencias?: Json
          argumentos?: Json | null
          categoria_id?: string | null
          componentes?: Json | null
          contradicciones?: Json | null
          creada_en?: string
          creada_por?: string | null
          editada_en?: string | null
          estado?: string
          id?: string
          motivo_codigo?: string | null
          motivo_fallo?: string | null
          nivel_evidencia?: string | null
          origen?: string
          por_que?: string | null
          puntaje?: number | null
          semana?: string | null
          sintetizando_desde?: string
          temas?: string[]
          tesis?: string | null
          titulo?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "teorias_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "categorias"
            referencedColumns: ["id"]
          },
        ]
      }
      vinculos: {
        Row: {
          cita_a: string | null
          cita_b: string | null
          creado_en: string
          decidido_en: string | null
          decidido_por: string | null
          estado: string
          material_a: string
          material_b: string
          razon: string | null
          relevancia: number
          tipo: string
        }
        Insert: {
          cita_a?: string | null
          cita_b?: string | null
          creado_en?: string
          decidido_en?: string | null
          decidido_por?: string | null
          estado?: string
          material_a: string
          material_b: string
          razon?: string | null
          relevancia: number
          tipo: string
        }
        Update: {
          cita_a?: string | null
          cita_b?: string | null
          creado_en?: string
          decidido_en?: string | null
          decidido_por?: string | null
          estado?: string
          material_a?: string
          material_b?: string
          razon?: string | null
          relevancia?: number
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "vinculos_material_a_fkey"
            columns: ["material_a"]
            isOneToOne: false
            referencedRelation: "materiales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vinculos_material_b_fkey"
            columns: ["material_b"]
            isOneToOne: false
            referencedRelation: "materiales"
            referencedColumns: ["id"]
          },
        ]
      }
      visitas_clic: {
        Row: {
          dia: string
          enlace: string
          visitante: string
        }
        Insert: {
          dia: string
          enlace: string
          visitante: string
        }
        Update: {
          dia?: string
          enlace?: string
          visitante?: string
        }
        Relationships: []
      }
    }
    Views: {
      metricas_reel_ultima: {
        Row: {
          alcance: number | null
          comentarios: number | null
          compartidos: number | null
          dia: string | null
          guardados: number | null
          pieza_id: string | null
          tiempo_promedio: number | null
        }
        Relationships: [
          {
            foreignKeyName: "metricas_reel_pieza_id_fkey"
            columns: ["pieza_id"]
            isOneToOne: false
            referencedRelation: "piezas"
            referencedColumns: ["id"]
          },
        ]
      }
      temas_resumen: {
        Row: {
          actualizado_en: string | null
          afirmaciones: number | null
          alias: string[] | null
          autores: number | null
          categoria_id: string | null
          creado_en: string | null
          cubierto_por_coni: boolean | null
          descripcion: string | null
          evidencia: Json | null
          id: string | null
          nombre: string | null
          ultima_afirmacion: string | null
        }
        Relationships: [
          {
            foreignKeyName: "temas_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "categorias"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      archivar_ideas_del_motor: { Args: { p_semanas: number }; Returns: number }
      borrar_autor: { Args: { p_id: string }; Returns: undefined }
      conectar_instagram: {
        Args: { p_cuenta: string; p_expira_en: string; p_token: string }
        Returns: undefined
      }
      confirmar_costo_material: { Args: { p_id: string }; Returns: undefined }
      confirmar_gasto: {
        Args: { p_clave: string; p_real: number }
        Returns: {
          clave: string
          creado_en: string
          estado: string
          estimado_usd: number
          id: number
          mes: string
          paso: string
          pieza_id: string | null
          proveedor: string
          real_usd: number | null
        }
        SetofOptions: {
          from: "*"
          to: "gastos"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      crear_autor: {
        Args: { p_credencial: string; p_nombre: string; p_tipo: string }
        Returns: string
      }
      crear_categoria: { Args: { p_nombre: string }; Returns: string }
      descartar_idea: {
        Args: { p_id: string; p_motivo: string }
        Returns: undefined
      }
      editar_guion_como_coni: {
        Args: {
          p_guion: string
          p_pieza: string
          p_revision: Json
          p_texto: string
          p_version: number
        }
        Returns: {
          actualizada_en: string
          archivos_borrados_en: string | null
          audio_id: string | null
          avatar_id: string | null
          contenedor_clave: string | null
          contenedor_id: string | null
          creada_en: string
          destinos: string[]
          estado: Database["public"]["Enums"]["estado_pieza"]
          estado_antes_del_error:
            | Database["public"]["Enums"]["estado_pieza"]
            | null
          explicacion: string | null
          guion: string | null
          id: string
          idea_id: string | null
          intento: number
          media_id: string | null
          permalink: string | null
          publicacion_enviada_en: string | null
          publicacion_reclamada_hasta: string | null
          puerta1_en: string | null
          puerta1_formula: number | null
          puerta1_hash: string | null
          puerta1_por: string | null
          puerta2_en: string | null
          puerta2_formula: number | null
          puerta2_hash_texto: string | null
          puerta2_por: string | null
          puerta2_publicar_en: string | null
          puerta2_video_id: string | null
          render_id: string | null
          respaldo: Json | null
          revision: Json
          texto: string | null
          texto_linkedin: string | null
          titulo: string
          version: number
          video_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "piezas"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      editar_texto_como_coni: {
        Args: {
          p_pieza: string
          p_revision: Json
          p_texto: string
          p_version: number
        }
        Returns: {
          actualizada_en: string
          archivos_borrados_en: string | null
          audio_id: string | null
          avatar_id: string | null
          contenedor_clave: string | null
          contenedor_id: string | null
          creada_en: string
          destinos: string[]
          estado: Database["public"]["Enums"]["estado_pieza"]
          estado_antes_del_error:
            | Database["public"]["Enums"]["estado_pieza"]
            | null
          explicacion: string | null
          guion: string | null
          id: string
          idea_id: string | null
          intento: number
          media_id: string | null
          permalink: string | null
          publicacion_enviada_en: string | null
          publicacion_reclamada_hasta: string | null
          puerta1_en: string | null
          puerta1_formula: number | null
          puerta1_hash: string | null
          puerta1_por: string | null
          puerta2_en: string | null
          puerta2_formula: number | null
          puerta2_hash_texto: string | null
          puerta2_por: string | null
          puerta2_publicar_en: string | null
          puerta2_video_id: string | null
          render_id: string | null
          respaldo: Json | null
          revision: Json
          texto: string | null
          texto_linkedin: string | null
          titulo: string
          version: number
          video_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "piezas"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      es_coni: { Args: never; Returns: boolean }
      es_mantenedor: { Args: never; Returns: boolean }
      excluir_afirmacion: {
        Args: { p_excluida: boolean; p_id: string }
        Returns: undefined
      }
      fusionar_autores: {
        Args: { p_destino: string; p_origen: string }
        Returns: undefined
      }
      fusionar_par_de_temas: {
        Args: { p_ganador: string; p_perdedor: string }
        Returns: undefined
      }
      guardar_borrador: {
        Args: {
          p_clave: string
          p_guion: string
          p_pieza: string
          p_real: number
          p_respaldo?: Json
          p_revision: Json
          p_texto: string
          p_texto_linkedin?: string
          p_version: number
        }
        Returns: {
          actualizada_en: string
          archivos_borrados_en: string | null
          audio_id: string | null
          avatar_id: string | null
          contenedor_clave: string | null
          contenedor_id: string | null
          creada_en: string
          destinos: string[]
          estado: Database["public"]["Enums"]["estado_pieza"]
          estado_antes_del_error:
            | Database["public"]["Enums"]["estado_pieza"]
            | null
          explicacion: string | null
          guion: string | null
          id: string
          idea_id: string | null
          intento: number
          media_id: string | null
          permalink: string | null
          publicacion_enviada_en: string | null
          publicacion_reclamada_hasta: string | null
          puerta1_en: string | null
          puerta1_formula: number | null
          puerta1_hash: string | null
          puerta1_por: string | null
          puerta2_en: string | null
          puerta2_formula: number | null
          puerta2_hash_texto: string | null
          puerta2_por: string | null
          puerta2_publicar_en: string | null
          puerta2_video_id: string | null
          render_id: string | null
          respaldo: Json | null
          revision: Json
          texto: string | null
          texto_linkedin: string | null
          titulo: string
          version: number
          video_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "piezas"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      guardar_secreto: {
        Args: { p_nombre: string; p_valor: string }
        Returns: undefined
      }
      guardar_token_meta: {
        Args: { p_expira_en: string; p_token: string }
        Returns: undefined
      }
      leer_secreto: { Args: { p_nombre: string }; Returns: string }
      liberar_gasto: {
        Args: { p_clave: string }
        Returns: {
          clave: string
          creado_en: string
          estado: string
          estimado_usd: number
          id: number
          mes: string
          paso: string
          pieza_id: string | null
          proveedor: string
          real_usd: number | null
        }
        SetofOptions: {
          from: "*"
          to: "gastos"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      marcar_disparo_fallido: { Args: { p_id: string }; Returns: undefined }
      motor_afirmaciones_de_tema: {
        Args: { p_limite: number; p_tema: string }
        Returns: {
          autor: string
          cita: string
          dolor: string
          emocion: string
          evidencia: string
          id: string
          publico: string
          texto: string
          tipo: string
        }[]
      }
      motor_pares: {
        Args: { p_minimo_autores: number }
        Returns: {
          a: string
          autores_comunes: number
          b: string
          puente: number
        }[]
      }
      motor_temas: {
        Args: never
        Returns: {
          afirmaciones: number
          autores: number
          cubierto_por_coni: boolean
          evidencia_fuerte: number
          nombre: string
          pilar: string
          tema_id: string
        }[]
      }
      olvidar_visitas_clic: { Args: { p_antes_de: string }; Returns: number }
      recalcular_tema: { Args: { p_tema: string }; Returns: undefined }
      registrar_clic: {
        Args: { p_dia: string; p_enlace: string; p_visitante: string }
        Returns: boolean
      }
      reintentar_material: { Args: { p_id: string }; Returns: undefined }
      renombrar_categoria: {
        Args: { p_id: string; p_nombre: string }
        Returns: undefined
      }
      reprocesar_material: { Args: { p_id: string }; Returns: undefined }
      reservar_gasto: {
        Args: {
          p_ahora?: string
          p_clave: string
          p_estimado: number
          p_paso: string
          p_pieza: string
          p_proveedor: string
        }
        Returns: {
          clave: string
          creado_en: string
          estado: string
          estimado_usd: number
          id: number
          mes: string
          paso: string
          pieza_id: string | null
          proveedor: string
          real_usd: number | null
        }
        SetofOptions: {
          from: "*"
          to: "gastos"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      reservar_gasto_general: {
        Args: {
          p_ahora?: string
          p_clave: string
          p_estimado: number
          p_paso: string
          p_proveedor: string
        }
        Returns: {
          clave: string
          creado_en: string
          estado: string
          estimado_usd: number
          id: number
          mes: string
          paso: string
          pieza_id: string | null
          proveedor: string
          real_usd: number | null
        }
        SetofOptions: {
          from: "*"
          to: "gastos"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      respaldo_de_idea: {
        Args: { p_idea: string; p_limite: number }
        Returns: Json
      }
      siguiente_version_de_guion: { Args: { p_pieza: string }; Returns: number }
      tema_mas_cercano: {
        Args: { p_umbral: number; p_vector: string }
        Returns: {
          similitud: number
          tema_id: string
        }[]
      }
      temas_parecidos: {
        Args: { p_umbral: number }
        Returns: {
          a: string
          b: string
          similitud: number
        }[]
      }
      tomar_para_publicar: {
        Args: { p_ahora: string; p_arriendo_segundos?: number }
        Returns: {
          actualizada_en: string
          archivos_borrados_en: string | null
          audio_id: string | null
          avatar_id: string | null
          contenedor_clave: string | null
          contenedor_id: string | null
          creada_en: string
          destinos: string[]
          estado: Database["public"]["Enums"]["estado_pieza"]
          estado_antes_del_error:
            | Database["public"]["Enums"]["estado_pieza"]
            | null
          explicacion: string | null
          guion: string | null
          id: string
          idea_id: string | null
          intento: number
          media_id: string | null
          permalink: string | null
          publicacion_enviada_en: string | null
          publicacion_reclamada_hasta: string | null
          puerta1_en: string | null
          puerta1_formula: number | null
          puerta1_hash: string | null
          puerta1_por: string | null
          puerta2_en: string | null
          puerta2_formula: number | null
          puerta2_hash_texto: string | null
          puerta2_por: string | null
          puerta2_publicar_en: string | null
          puerta2_video_id: string | null
          render_id: string | null
          respaldo: Json | null
          revision: Json
          texto: string | null
          texto_linkedin: string | null
          titulo: string
          version: number
          video_id: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "piezas"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      unaccent_inmutable: { Args: { texto: string }; Returns: string }
    }
    Enums: {
      estado_pieza:
        | "idea"
        | "guion_en_proceso"
        | "guion_por_aprobar"
        | "guion_aprobado"
        | "grabando_voz"
        | "en_render"
        | "subtitulando"
        | "video_por_aprobar"
        | "programado"
        | "publicado"
        | "error_produccion"
        | "error_publicacion"
        | "descartado"
        | "para_subir_a_mano"
        | "publicado_a_mano"
      pilar: "pareja" | "deseo" | "autoestima" | "limites" | "bienestar"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      estado_pieza: [
        "idea",
        "guion_en_proceso",
        "guion_por_aprobar",
        "guion_aprobado",
        "grabando_voz",
        "en_render",
        "subtitulando",
        "video_por_aprobar",
        "programado",
        "publicado",
        "error_produccion",
        "error_publicacion",
        "descartado",
        "para_subir_a_mano",
        "publicado_a_mano",
      ],
      pilar: ["pareja", "deseo", "autoestima", "limites", "bienestar"],
    },
  },
} as const

