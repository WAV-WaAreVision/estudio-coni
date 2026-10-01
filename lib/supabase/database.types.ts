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
      ajustes: {
        Row: {
          avisos_resumen: boolean
          avisos_urgentes: boolean
          dias_publicacion: number[]
          hora_publicacion: string
          id: boolean
          meta: string
          meta_cuenta_id: string | null
          meta_token_expira_en: string | null
          produccion: Json
          tope_mensual_usd: number
          zona: string
        }
        Insert: {
          avisos_resumen?: boolean
          avisos_urgentes?: boolean
          dias_publicacion?: number[]
          hora_publicacion?: string
          id?: boolean
          meta?: string
          meta_cuenta_id?: string | null
          meta_token_expira_en?: string | null
          produccion?: Json
          tope_mensual_usd?: number
          zona?: string
        }
        Update: {
          avisos_resumen?: boolean
          avisos_urgentes?: boolean
          dias_publicacion?: number[]
          hora_publicacion?: string
          id?: boolean
          meta?: string
          meta_cuenta_id?: string | null
          meta_token_expira_en?: string | null
          produccion?: Json
          tope_mensual_usd?: number
          zona?: string
        }
        Relationships: []
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
          numero: number | null
          pilar: Database["public"]["Enums"]["pilar"]
          tema: string
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
          numero?: number | null
          pilar: Database["public"]["Enums"]["pilar"]
          tema?: string
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
          numero?: number | null
          pilar?: Database["public"]["Enums"]["pilar"]
          tema?: string
        }
        Relationships: []
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
      piezas: {
        Row: {
          actualizada_en: string
          archivos_borrados_en: string | null
          audio_id: string | null
          contenedor_clave: string | null
          contenedor_id: string | null
          creada_en: string
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
          puerta1_hash: string | null
          puerta1_por: string | null
          puerta2_en: string | null
          puerta2_hash_texto: string | null
          puerta2_por: string | null
          puerta2_publicar_en: string | null
          puerta2_video_id: string | null
          render_id: string | null
          revision: Json
          texto: string | null
          titulo: string
          version: number
          video_id: string | null
        }
        Insert: {
          actualizada_en?: string
          archivos_borrados_en?: string | null
          audio_id?: string | null
          contenedor_clave?: string | null
          contenedor_id?: string | null
          creada_en?: string
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
          puerta1_hash?: string | null
          puerta1_por?: string | null
          puerta2_en?: string | null
          puerta2_hash_texto?: string | null
          puerta2_por?: string | null
          puerta2_publicar_en?: string | null
          puerta2_video_id?: string | null
          render_id?: string | null
          revision?: Json
          texto?: string | null
          titulo: string
          version?: number
          video_id?: string | null
        }
        Update: {
          actualizada_en?: string
          archivos_borrados_en?: string | null
          audio_id?: string | null
          contenedor_clave?: string | null
          contenedor_id?: string | null
          creada_en?: string
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
          puerta1_hash?: string | null
          puerta1_por?: string | null
          puerta2_en?: string | null
          puerta2_hash_texto?: string | null
          puerta2_por?: string | null
          puerta2_publicar_en?: string | null
          puerta2_video_id?: string | null
          render_id?: string | null
          revision?: Json
          texto?: string | null
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      conectar_instagram: {
        Args: { p_cuenta: string; p_expira_en: string; p_token: string }
        Returns: undefined
      }
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
          contenedor_clave: string | null
          contenedor_id: string | null
          creada_en: string
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
          puerta1_hash: string | null
          puerta1_por: string | null
          puerta2_en: string | null
          puerta2_hash_texto: string | null
          puerta2_por: string | null
          puerta2_publicar_en: string | null
          puerta2_video_id: string | null
          render_id: string | null
          revision: Json
          texto: string | null
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
      guardar_borrador: {
        Args: {
          p_clave: string
          p_guion: string
          p_pieza: string
          p_real: number
          p_revision: Json
          p_texto: string
          p_version: number
        }
        Returns: {
          actualizada_en: string
          archivos_borrados_en: string | null
          audio_id: string | null
          contenedor_clave: string | null
          contenedor_id: string | null
          creada_en: string
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
          puerta1_hash: string | null
          puerta1_por: string | null
          puerta2_en: string | null
          puerta2_hash_texto: string | null
          puerta2_por: string | null
          puerta2_publicar_en: string | null
          puerta2_video_id: string | null
          render_id: string | null
          revision: Json
          texto: string | null
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
      tomar_para_publicar: {
        Args: { p_ahora: string; p_arriendo_segundos?: number }
        Returns: {
          actualizada_en: string
          archivos_borrados_en: string | null
          audio_id: string | null
          contenedor_clave: string | null
          contenedor_id: string | null
          creada_en: string
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
          puerta1_hash: string | null
          puerta1_por: string | null
          puerta2_en: string | null
          puerta2_hash_texto: string | null
          puerta2_por: string | null
          puerta2_publicar_en: string | null
          puerta2_video_id: string | null
          render_id: string | null
          revision: Json
          texto: string | null
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
    }
    Enums: {
      estado_pieza:
        | "idea"
        | "guion_en_proceso"
        | "guion_por_aprobar"
        | "en_render"
        | "subtitulando"
        | "video_por_aprobar"
        | "programado"
        | "publicado"
        | "error_produccion"
        | "error_publicacion"
        | "descartado"
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
        "en_render",
        "subtitulando",
        "video_por_aprobar",
        "programado",
        "publicado",
        "error_produccion",
        "error_publicacion",
        "descartado",
      ],
      pilar: ["pareja", "deseo", "autoestima", "limites", "bienestar"],
    },
  },
} as const

